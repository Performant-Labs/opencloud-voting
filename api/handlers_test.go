//go:build integration

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/opencloud-eu/opencloud-voting/api/middleware"
	"github.com/rs/zerolog"
)

func testLogger() zerolog.Logger {
	return zerolog.New(os.Stdout).Level(zerolog.Disabled)
}

// setupTestApp creates a mux with all routes and a real SQLite database.
func setupTestApp(t *testing.T) (http.Handler, *VotingStore) {
	t.Helper()

	db, cleanup := newTestDB(t)
	t.Cleanup(cleanup)

	if err := migrateSchema(context.Background(), db); err != nil {
		t.Fatalf("migrate schema: %v", err)
	}

	// Enable foreign keys for cascade delete testing.
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatalf("enable foreign keys: %v", err)
	}

	logger := testLogger()
	store := NewVotingStore(db, logger)
	handler := NewVotingHandler(store, logger)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	return mux, store
}

// requestWithUser creates a request with the user ID injected into context,
// simulating what the OIDC auth middleware does in production.
func requestWithUser(method, path string, body []byte, userID string) *http.Request {
	var req *http.Request
	if body != nil {
		req = httptest.NewRequest(method, path, bytes.NewReader(body))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}

	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.ExportedUserIDKey(), userID)
		req = req.WithContext(ctx)
	}

	return req
}

// --- Step 520: Create Feature Tests ---

func TestCreateFeature_Success(t *testing.T) {
	mux, _ := setupTestApp(t)

	body := `{"title":"My Feature","description":"A great feature"}`
	req := requestWithUser(http.MethodPost, "/api/voting/features", []byte(body), "user-1")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("create feature: got %d, want %d. Body: %s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["id"] == "" {
		t.Error("expected non-empty feature ID in response")
	}
}

func TestCreateFeature_EmptyTitle(t *testing.T) {
	mux, _ := setupTestApp(t)

	body := `{"title":"","description":"no title"}`
	req := requestWithUser(http.MethodPost, "/api/voting/features", []byte(body), "user-1")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("empty title: got %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var errResp ErrorResponse
	json.Unmarshal(rec.Body.Bytes(), &errResp)
	if errResp.Code != "ERR_TITLE_EMPTY" {
		t.Errorf("expected ERR_TITLE_EMPTY, got %q", errResp.Code)
	}
}

func TestCreateFeature_TitleTooLong(t *testing.T) {
	mux, _ := setupTestApp(t)

	longTitle := strings.Repeat("x", 256)
	body := `{"title":"` + longTitle + `","description":"too long"}`
	req := requestWithUser(http.MethodPost, "/api/voting/features", []byte(body), "user-1")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("title too long: got %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestCreateFeature_NoAuth(t *testing.T) {
	mux, _ := setupTestApp(t)

	body := `{"title":"Test","description":"no auth"}`
	req := requestWithUser(http.MethodPost, "/api/voting/features", []byte(body), "")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("no auth: got %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

// --- Step 510: List Features Tests ---

func TestListFeatures_Empty(t *testing.T) {
	mux, _ := setupTestApp(t)

	req := requestWithUser(http.MethodGet, "/api/voting/features", nil, "user-1")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("list features: got %d, want %d", rec.Code, http.StatusOK)
	}

	var resp FeatureListResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Total != 0 {
		t.Errorf("expected 0 features, got %d", resp.Total)
	}
}

func TestListFeatures_WithVoteCounts(t *testing.T) {
	mux, store := setupTestApp(t)

	ctx := context.Background()
	if err := store.CreateFeature(ctx, "feat-1", "Feature One", "desc", "user-a"); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if _, err := store.ToggleVote(ctx, "feat-1", "user-a"); err != nil {
		t.Fatalf("setup vote: %v", err)
	}
	if _, err := store.ToggleVote(ctx, "feat-1", "user-b"); err != nil {
		t.Fatalf("setup vote 2: %v", err)
	}

	req := requestWithUser(http.MethodGet, "/api/voting/features", nil, "user-a")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	var resp FeatureListResponse
	json.Unmarshal(rec.Body.Bytes(), &resp)

	if resp.Total != 1 {
		t.Fatalf("expected 1 feature, got %d", resp.Total)
	}
	if resp.Features[0].VoteCount != 2 {
		t.Errorf("expected 2 votes, got %d", resp.Features[0].VoteCount)
	}
}

// --- Step 540: Toggle Vote Tests ---

func TestToggleVote_AddAndRemove(t *testing.T) {
	mux, store := setupTestApp(t)

	ctx := context.Background()
	if err := store.CreateFeature(ctx, "feat-1", "Feature One", "desc", "user-a"); err != nil {
		t.Fatalf("setup: %v", err)
	}

	// First vote: should add.
	req := requestWithUser(http.MethodPost, "/api/voting/features/feat-1/vote", nil, "user-b")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("add vote: got %d, want %d", rec.Code, http.StatusOK)
	}
	var voteResp map[string]bool
	json.Unmarshal(rec.Body.Bytes(), &voteResp)
	if !voteResp["voted"] {
		t.Error("expected voted=true after first toggle")
	}

	// Second vote: should remove.
	req = requestWithUser(http.MethodPost, "/api/voting/features/feat-1/vote", nil, "user-b")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	json.Unmarshal(rec.Body.Bytes(), &voteResp)
	if voteResp["voted"] {
		t.Error("expected voted=false after second toggle")
	}
}

func TestToggleVote_NonExistentFeature(t *testing.T) {
	mux, _ := setupTestApp(t)

	req := requestWithUser(http.MethodPost, "/api/voting/features/fake-id/vote", nil, "user-1")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("vote on nonexistent: got %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestToggleVote_ConcurrentDuplicates(t *testing.T) {
	mux, store := setupTestApp(t)

	ctx := context.Background()
	if err := store.CreateFeature(ctx, "feat-1", "Concurrent Feature", "desc", "user-a"); err != nil {
		t.Fatalf("setup: %v", err)
	}

	// Simulate 10 concurrent vote toggles from the same user.
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := requestWithUser(http.MethodPost, "/api/voting/features/feat-1/vote", nil, "user-b")
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
		}()
	}
	wg.Wait()

	// After 10 toggles (even number), the vote should NOT exist.
	features, err := store.ListFeatures(ctx)
	if err != nil {
		t.Fatalf("list features: %v", err)
	}
	if len(features) != 1 {
		t.Fatalf("expected 1 feature, got %d", len(features))
	}
	// Vote count should be 0 or 1 — never more than 1.
	if features[0].VoteCount > 1 {
		t.Errorf("concurrent vote inflation detected: vote_count=%d (should be 0 or 1)", features[0].VoteCount)
	}
}

// --- Step 530: Delete Feature Tests ---

func TestDeleteFeature_OwnerSuccess(t *testing.T) {
	mux, store := setupTestApp(t)

	ctx := context.Background()
	if err := store.CreateFeature(ctx, "feat-1", "My Feature", "desc", "user-a"); err != nil {
		t.Fatalf("setup: %v", err)
	}

	req := requestWithUser(http.MethodDelete, "/api/voting/features/feat-1", nil, "user-a")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("owner delete: got %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestDeleteFeature_NonOwnerForbidden(t *testing.T) {
	mux, store := setupTestApp(t)

	ctx := context.Background()
	if err := store.CreateFeature(ctx, "feat-1", "Someone Else's Feature", "desc", "user-a"); err != nil {
		t.Fatalf("setup: %v", err)
	}

	req := requestWithUser(http.MethodDelete, "/api/voting/features/feat-1", nil, "user-b")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("non-owner delete: got %d, want %d", rec.Code, http.StatusForbidden)
	}

	var errResp ErrorResponse
	json.Unmarshal(rec.Body.Bytes(), &errResp)
	if errResp.Code != "ERR_NOT_OWNER" {
		t.Errorf("expected ERR_NOT_OWNER, got %q", errResp.Code)
	}
}

// --- Step 560: Metrics Tests ---

func TestMetricsEndpoint(t *testing.T) {
	metrics := NewVotingMetrics()

	handler := metrics.Handler()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("metrics: got %d, want %d", rec.Code, http.StatusOK)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "voting_requests_total") {
		t.Error("metrics output missing voting_requests_total")
	}
	if !strings.Contains(body, "voting_requests_4xx") {
		t.Error("metrics output missing voting_requests_4xx")
	}
	if !strings.Contains(body, "voting_avg_latency_ms") {
		t.Error("metrics output missing voting_avg_latency_ms")
	}
}
