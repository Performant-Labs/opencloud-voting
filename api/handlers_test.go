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

func TestCreateFeature_CapacityLimitReached(t *testing.T) {
	mux, store := setupTestApp(t)
	ctx := context.Background()

	// Given we simulate reaching the 2500 limit by inserting mock feature stubs
	// Note: Inserting 2500 rows in SQLite for a unit test will take a few milliseconds.
	// For raw speed without loops, we configure the test environment specifically if needed, 
	// but a fast loop of 2500 light inserts in WAL mode is fast enough for isolated tests.
	for i := 0; i < 2500; i++ {
		err := store.CreateFeature(ctx, "feat_mock_"+string(rune(i)), "Title", "Desc", "user-1")
		if err != nil {
			t.Fatalf("setup mock feature #%d failed: %v", i, err)
		}
	}

	// When we submit the 2501st feature
	body := `{"title":"Over The Limit Feature","description":"This should be heavily rejected"}`
	req := requestWithUser(http.MethodPost, "/api/voting/features", []byte(body), "user-2")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	// Then it is rejected with 403 Forbidden
	if rec.Code != http.StatusForbidden {
		t.Errorf("capacity limit: got %d, want %d", rec.Code, http.StatusForbidden)
	}

	var errResp ErrorResponse
	json.Unmarshal(rec.Body.Bytes(), &errResp)
	if errResp.Code != "ERR_LIMIT_REACHED" {
		t.Errorf("expected ERR_LIMIT_REACHED, got %q", errResp.Code)
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
	// CreateFeature auto-votes for the creator (user-a), so vote_count starts at 1.
	if err := store.CreateFeature(ctx, "feat-1", "Feature One", "desc", "user-a"); err != nil {
		t.Fatalf("setup: %v", err)
	}
	// user-b also votes, bringing total to 2.
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
	if !resp.Features[0].Voted {
		t.Error("expected voted=true for user-a (auto-vote from creation)")
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
	features, err := store.ListFeatures(ctx, "user-b")
	if err != nil {
		t.Fatalf("list features: %v", err)
	}
	if len(features) != 1 {
		t.Fatalf("expected 1 feature, got %d", len(features))
	}
	// Author auto-vote = 1, plus user-b toggled 10 times (even = off).
	// Vote count should be 1 (author only) or 2 (author + user-b) — never more.
	if features[0].VoteCount > 2 {
		t.Errorf("concurrent vote inflation detected: vote_count=%d (should be 1 or 2)", features[0].VoteCount)
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

func TestMetricsMiddleware_RecordsStatusCodes(t *testing.T) {
	metrics := NewVotingMetrics()

	// Wrap a handler that returns 400.
	badHandler := metrics.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	badHandler.ServeHTTP(rec, req)

	// Verify the 4xx counter incremented.
	metricsReq := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	metricsRec := httptest.NewRecorder()
	metrics.Handler().ServeHTTP(metricsRec, metricsReq)

	body := metricsRec.Body.String()
	if !strings.Contains(body, "voting_requests_total 1") {
		t.Error("expected voting_requests_total to be 1")
	}
	if !strings.Contains(body, "voting_requests_4xx 1") {
		t.Error("expected voting_requests_4xx to be 1")
	}
}

// --- GDPR Deletion Tests ---

func TestDeleteUserData_RemovesAllData(t *testing.T) {
	_, store := setupTestApp(t)

	ctx := context.Background()

	// User A creates a feature (auto-votes for it).
	if err := store.CreateFeature(ctx, "feat-1", "User A Feature", "desc", "user-a"); err != nil {
		t.Fatalf("create feature: %v", err)
	}

	// User B also votes on user A's feature.
	if _, err := store.ToggleVote(ctx, "feat-1", "user-b"); err != nil {
		t.Fatalf("vote user-b: %v", err)
	}

	// GDPR erasure for user A.
	if err := store.DeleteUserData(ctx, "user-a"); err != nil {
		t.Fatalf("delete user data: %v", err)
	}

	// User A's feature should be gone, along with all votes on it.
	features, err := store.ListFeatures(ctx, "user-a")
	if err != nil {
		t.Fatalf("list features: %v", err)
	}
	if len(features) != 0 {
		t.Errorf("expected 0 features after GDPR erasure, got %d", len(features))
	}
}

// --- Invalid JSON Tests ---

func TestCreateFeature_InvalidJSON(t *testing.T) {
	mux, _ := setupTestApp(t)

	req := requestWithUser(http.MethodPost, "/api/voting/features", []byte("not json"), "user-1")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("invalid JSON: got %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var errResp ErrorResponse
	json.Unmarshal(rec.Body.Bytes(), &errResp)
	if errResp.Code != "ERR_INVALID_JSON" {
		t.Errorf("expected ERR_INVALID_JSON, got %q", errResp.Code)
	}
}

func TestDeleteFeature_NoAuth(t *testing.T) {
	mux, _ := setupTestApp(t)

	req := requestWithUser(http.MethodDelete, "/api/voting/features/some-id", nil, "")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("delete no auth: got %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestToggleVote_NoAuth(t *testing.T) {
	mux, _ := setupTestApp(t)

	req := requestWithUser(http.MethodPost, "/api/voting/features/some-id/vote", nil, "")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("vote no auth: got %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}
