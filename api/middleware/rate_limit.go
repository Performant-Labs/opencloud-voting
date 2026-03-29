package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// RateLimiter implements a per-user token bucket rate limiter using only
// the standard library. No third-party rate limiting packages (e.g.,
// go-chi/httprate) are used, per PLAN_INSTRUCTIONS.md.
//
// Each authenticated user gets an independent bucket identified by their
// OpenID Connect (OIDC) `sub` claim, preventing a single aggressive user
// from exhausting the API for everyone.
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    int           // tokens added per interval
	burst   int           // max tokens in a bucket
	window  time.Duration // refill interval
	logger  zerolog.Logger
}

type bucket struct {
	tokens     int
	lastRefill time.Time
}

// NewRateLimiter creates a rate limiter that allows `rate` requests per
// `window` duration, with a burst capacity of `burst`.
func NewRateLimiter(rate int, burst int, window time.Duration, logger zerolog.Logger) *RateLimiter {
	return &RateLimiter{
		buckets: make(map[string]*bucket),
		rate:    rate,
		burst:   burst,
		window:  window,
		logger:  logger,
	}
}

// refill adds tokens based on elapsed time since the last refill.
func (rl *RateLimiter) refill(b *bucket) {
	now := time.Now()
	elapsed := now.Sub(b.lastRefill)
	tokensToAdd := int(elapsed/rl.window) * rl.rate

	if tokensToAdd > 0 {
		b.tokens += tokensToAdd
		if b.tokens > rl.burst {
			b.tokens = rl.burst
		}
		b.lastRefill = now
	}
}

// allow checks whether the given user ID has remaining rate limit capacity.
func (rl *RateLimiter) allow(userID string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, exists := rl.buckets[userID]
	if !exists {
		b = &bucket{
			tokens:     rl.burst,
			lastRefill: time.Now(),
		}
		rl.buckets[userID] = b
	}

	rl.refill(b)

	if b.tokens <= 0 {
		return false
	}

	b.tokens--
	return true
}

// Middleware returns an http.Handler wrapper that enforces per-user rate
// limits. Requires the OIDCAuth middleware to run first so that the user
// ID is available in the request context.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := UserIDFromContext(r.Context())
		if userID == "" {
			// No user ID means auth middleware didn't run or the request
			// is unauthenticated. Let downstream handlers deal with it.
			next.ServeHTTP(w, r)
			return
		}

		if !rl.allow(userID) {
			rl.logger.Warn().Str("user_id", userID).Msg("rate limit exceeded")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error_code":"ERR_RATE_LIMITED","message":"too many requests"}`))
			return
		}

		next.ServeHTTP(w, r)
	})
}
