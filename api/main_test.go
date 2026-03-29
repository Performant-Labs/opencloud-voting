package main

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// newTestDB creates a temporary SQLite database for testing.
// It returns the database handle and a cleanup function.
func newTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "feature-voting-test.sqlite")

	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}

	cleanup := func() {
		db.Close()
		os.Remove(dbPath)
	}

	return db, cleanup
}

func TestSQLiteWALMode(t *testing.T) {
	db, cleanup := newTestDB(t)
	defer cleanup()

	// Explicitly enable WAL mode as main.go does.
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		t.Fatalf("failed to set WAL mode: %v", err)
	}

	var mode string
	if err := db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatalf("failed to query journal_mode: %v", err)
	}

	if mode != "wal" {
		t.Errorf("expected journal_mode=wal, got %q", mode)
	}
}

func TestMigrateSchema_Idempotent(t *testing.T) {
	db, cleanup := newTestDB(t)
	defer cleanup()

	ctx := context.Background()

	// First migration: creates tables.
	if err := migrateSchema(ctx, db); err != nil {
		t.Fatalf("first migration failed: %v", err)
	}

	// Second migration: must not error (IF NOT EXISTS).
	if err := migrateSchema(ctx, db); err != nil {
		t.Fatalf("second migration (idempotency check) failed: %v", err)
	}

	// Verify both tables exist by inserting test data.
	_, err := db.ExecContext(ctx,
		`INSERT INTO voting_features (id, title, created_by) VALUES ('test-1', 'Test Feature', 'user-abc')`)
	if err != nil {
		t.Fatalf("insert into voting_features failed: %v", err)
	}

	_, err = db.ExecContext(ctx,
		`INSERT INTO voting_votes (feature_id, user_id) VALUES ('test-1', 'user-abc')`)
	if err != nil {
		t.Fatalf("insert into voting_votes failed: %v", err)
	}
}

func TestMigrateSchema_DuplicateVotePrevented(t *testing.T) {
	db, cleanup := newTestDB(t)
	defer cleanup()

	ctx := context.Background()
	if err := migrateSchema(ctx, db); err != nil {
		t.Fatalf("migration failed: %v", err)
	}

	_, err := db.ExecContext(ctx,
		`INSERT INTO voting_features (id, title, created_by) VALUES ('feat-1', 'Feature One', 'user-a')`)
	if err != nil {
		t.Fatalf("insert feature failed: %v", err)
	}

	// First vote: should succeed.
	_, err = db.ExecContext(ctx,
		`INSERT INTO voting_votes (feature_id, user_id) VALUES ('feat-1', 'user-a')`)
	if err != nil {
		t.Fatalf("first vote insert failed: %v", err)
	}

	// Duplicate vote: composite PK must reject this.
	_, err = db.ExecContext(ctx,
		`INSERT INTO voting_votes (feature_id, user_id) VALUES ('feat-1', 'user-a')`)
	if err == nil {
		t.Fatal("expected duplicate vote to be rejected by PRIMARY KEY constraint, but it succeeded")
	}
}

func TestMigrateSchema_CascadeDeleteVotes(t *testing.T) {
	db, cleanup := newTestDB(t)
	defer cleanup()

	ctx := context.Background()

	// Enable foreign keys (SQLite requires explicit activation).
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		t.Fatalf("failed to enable foreign keys: %v", err)
	}

	if err := migrateSchema(ctx, db); err != nil {
		t.Fatalf("migration failed: %v", err)
	}

	_, err := db.ExecContext(ctx,
		`INSERT INTO voting_features (id, title, created_by) VALUES ('feat-2', 'Feature Two', 'user-b')`)
	if err != nil {
		t.Fatalf("insert feature failed: %v", err)
	}
	_, err = db.ExecContext(ctx,
		`INSERT INTO voting_votes (feature_id, user_id) VALUES ('feat-2', 'user-b')`)
	if err != nil {
		t.Fatalf("insert vote failed: %v", err)
	}

	// Delete the feature; cascade must remove the vote.
	_, err = db.ExecContext(ctx, `DELETE FROM voting_features WHERE id = 'feat-2'`)
	if err != nil {
		t.Fatalf("delete feature failed: %v", err)
	}

	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM voting_votes WHERE feature_id = 'feat-2'`).Scan(&count); err != nil {
		t.Fatalf("count votes failed: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 orphan votes after cascade delete, got %d", count)
	}
}

func TestHealthzEndpoint(t *testing.T) {
	db, cleanup := newTestDB(t)
	defer cleanup()

	if err := migrateSchema(context.Background(), db); err != nil {
		t.Fatalf("migration failed: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			http.Error(w, "unhealthy", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("GET /healthz returned %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestReadyzEndpoint(t *testing.T) {
	db, cleanup := newTestDB(t)
	defer cleanup()

	if err := migrateSchema(context.Background(), db); err != nil {
		t.Fatalf("migration failed: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("GET /readyz returned %d, want %d", rec.Code, http.StatusOK)
	}
}
