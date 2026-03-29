package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

// stubHandler is a simple handler that records whether it was called
// and writes the user ID from context into the response.
func stubHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := UserIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("user:" + userID))
	}
}

func testLogger() zerolog.Logger {
	return zerolog.New(os.Stdout).Level(zerolog.Disabled)
}

// --- Auth Middleware Tests ---

func TestAuthMiddleware_MissingHeader(t *testing.T) {
	auth := NewOIDCAuth("https://unused.test", testLogger())

	handler := auth.Middleware(stubHandler())
	req := httptest.NewRequest(http.MethodGet, "/api/voting/features", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("missing auth header: got %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_MalformedHeader(t *testing.T) {
	auth := NewOIDCAuth("https://unused.test", testLogger())

	handler := auth.Middleware(stubHandler())
	req := httptest.NewRequest(http.MethodGet, "/api/voting/features", nil)
	req.Header.Set("Authorization", "NotBearer sometoken")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("malformed auth header: got %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	// Point at a non-existent issuer. The provider discovery will fail,
	// and the middleware should return 503 (service unavailable).
	auth := NewOIDCAuth("https://nonexistent.invalid", testLogger())

	handler := auth.Middleware(stubHandler())
	req := httptest.NewRequest(http.MethodGet, "/api/voting/features", nil)
	req.Header.Set("Authorization", "Bearer fake.jwt.token")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("unreachable issuer: got %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

func TestUserIDFromContext_Empty(t *testing.T) {
	ctx := context.Background()
	if got := UserIDFromContext(ctx); got != "" {
		t.Errorf("expected empty user ID from bare context, got %q", got)
	}
}

func TestUserIDFromContext_Populated(t *testing.T) {
	ctx := context.WithValue(context.Background(), userIDKey, "user-abc-123")
	if got := UserIDFromContext(ctx); got != "user-abc-123" {
		t.Errorf("expected 'user-abc-123', got %q", got)
	}
}

// --- Rate Limiter Tests ---

func TestRateLimiter_AllowsWithinBurst(t *testing.T) {
	rl := NewRateLimiter(1, 3, time.Second, testLogger())
	handler := rl.Middleware(stubHandler())

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		ctx := context.WithValue(req.Context(), userIDKey, "user-1")
		req = req.WithContext(ctx)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("request %d within burst: got %d, want %d", i+1, rec.Code, http.StatusOK)
		}
	}
}

func TestRateLimiter_RejectsOverBurst(t *testing.T) {
	rl := NewRateLimiter(1, 2, time.Second, testLogger())
	handler := rl.Middleware(stubHandler())

	// Exhaust the burst.
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		ctx := context.WithValue(req.Context(), userIDKey, "user-2")
		req = req.WithContext(ctx)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
	}

	// Third request should be rate limited.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := context.WithValue(req.Context(), userIDKey, "user-2")
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("over burst: got %d, want %d", rec.Code, http.StatusTooManyRequests)
	}
}

func TestRateLimiter_PerUserIsolation(t *testing.T) {
	rl := NewRateLimiter(1, 1, time.Second, testLogger())
	handler := rl.Middleware(stubHandler())

	// User A exhausts their single token.
	reqA := httptest.NewRequest(http.MethodGet, "/", nil)
	ctxA := context.WithValue(reqA.Context(), userIDKey, "user-a")
	reqA = reqA.WithContext(ctxA)
	recA := httptest.NewRecorder()
	handler.ServeHTTP(recA, reqA)

	// User B should still have their own bucket.
	reqB := httptest.NewRequest(http.MethodGet, "/", nil)
	ctxB := context.WithValue(reqB.Context(), userIDKey, "user-b")
	reqB = reqB.WithContext(ctxB)
	recB := httptest.NewRecorder()
	handler.ServeHTTP(recB, reqB)

	if recB.Code != http.StatusOK {
		t.Errorf("user-b should not be affected by user-a's rate limit, got %d", recB.Code)
	}
}

func TestRateLimiter_NoUserID_PassesThrough(t *testing.T) {
	rl := NewRateLimiter(1, 1, time.Second, testLogger())
	handler := rl.Middleware(stubHandler())

	// Request without user ID in context — should pass through.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("no user ID should pass through, got %d", rec.Code)
	}
}
