package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	// ── Structured Logging (Step 350) ──────────────────────────────────
	//
	// Why zerolog?
	// OpenCloud/oCIS uses github.com/rs/zerolog as its standard structured
	// logging library across all services and extensions. Using zerolog
	// ensures our JSON log output is format-compatible with the existing
	// ELK/Loki ingestion pipelines and matches oCIS code conventions for
	// Tier-1 submittability.
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	level := zerolog.InfoLevel
	if os.Getenv("OC_LOG_LEVEL") == "debug" {
		level = zerolog.DebugLevel
	}
	zerolog.SetGlobalLevel(level)

	logger := zerolog.New(os.Stdout).With().Timestamp().Str("service", "voting-app").Logger()
	log.Logger = logger

	// ── Database Initialization (Step 340) ─────────────────────────────
	//
	// Why dynamic switching?
	// Enterprise OpenCloud deployments provide a centralized Postgres or
	// MariaDB cluster via OC_DB_URL. Standalone or dev environments have
	// no such cluster, so we fall back to a local SQLite file with WAL
	// mode for high-concurrency safety.
	db, err := openDatabase(logger)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to initialize database")
	}
	defer db.Close()

	if err := migrateSchema(context.Background(), db); err != nil {
		logger.Fatal().Err(err).Msg("failed to migrate database schema")
	}
	logger.Info().Msg("database schema verified")

	// ── HTTP Server & Routing (Step 340) ───────────────────────────────
	//
	// Why Go 1.22 ServeMux?
	// PLAN_INSTRUCTIONS.md mandates standard library exclusivity for
	// routing: no chi, Gin, or Fiber. Go 1.22's ServeMux supports
	// method-based routing natively (e.g., "GET /path").
	mux := http.NewServeMux()

	// Health & readiness probes (Step 550 placeholder)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			http.Error(w, "unhealthy", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ready")
	})

	// API routes will be registered in Phase 500.
	// Placeholder root for basic connectivity verification.
	mux.HandleFunc("GET /api/voting/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `{"service":"opencloud-feature-voting","status":"ok"}`)
	})

	server := &http.Server{
		Addr:         ":8080",
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// ── Graceful Shutdown (Step 360) ──────────────────────────────────
	//
	// Why trap SIGTERM?
	// When Kubernetes or Docker Compose scales down a pod, the container
	// receives SIGTERM. Without graceful shutdown, in-flight HTTP requests
	// and SQLite WAL journal flushes are violently interrupted, risking
	// data corruption and client-visible 502 errors.
	shutdownCh := make(chan os.Signal, 1)
	signal.Notify(shutdownCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Info().Str("addr", server.Addr).Msg("voting-app server starting")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("server listen failed")
		}
	}()

	sig := <-shutdownCh
	logger.Info().Str("signal", sig.String()).Msg("shutdown signal received")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Fatal().Err(err).Msg("graceful shutdown failed")
	}

	logger.Info().Msg("voting-app server stopped gracefully")
}

// openDatabase initializes the database connection.
// It checks OC_DB_URL for an enterprise Postgres/MariaDB connection string.
// If absent, it falls back to a local SQLite file at DB_PATH with WAL mode.
func openDatabase(logger zerolog.Logger) (*sql.DB, error) {
	if connStr := os.Getenv("OC_DB_URL"); connStr != "" {
		logger.Info().Str("driver", "postgres").Msg("connecting to external database")
		return sql.Open("postgres", connStr)
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/data/feature-voting.sqlite"
	}

	logger.Info().Str("path", dbPath).Msg("using SQLite fallback")
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite: %w", err)
	}

	// Enforce WAL mode explicitly as a safety net.
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, fmt.Errorf("failed to set WAL mode: %w", err)
	}
	if _, err := db.Exec("PRAGMA busy_timeout=5000"); err != nil {
		return nil, fmt.Errorf("failed to set busy_timeout: %w", err)
	}

	return db, nil
}

// migrateSchema creates the voting tables if they do not exist.
// Uses prefixed table names (voting_*) to avoid collision with other
// OpenCloud extensions sharing the same database.
func migrateSchema(ctx context.Context, db *sql.DB) error {
	const schema = `
	CREATE TABLE IF NOT EXISTS voting_features (
		id          TEXT PRIMARY KEY,
		title       TEXT NOT NULL CHECK(length(title) <= 255),
		description TEXT NOT NULL DEFAULT '',
		created_by  TEXT NOT NULL,
		created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS voting_votes (
		feature_id TEXT NOT NULL REFERENCES voting_features(id) ON DELETE CASCADE,
		user_id    TEXT NOT NULL,
		voted_at   DATETIME NOT NULL DEFAULT (datetime('now')),
		PRIMARY KEY (feature_id, user_id)
	);
	`

	if _, err := db.ExecContext(ctx, schema); err != nil {
		return fmt.Errorf("failed to execute schema migration: %w", err)
	}

	return nil
}
