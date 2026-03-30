package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/rs/zerolog"
)

// contextKey is an unexported type to prevent context key collisions.
type contextKey string

const userIDKey contextKey = "userID"
const userNameKey contextKey = "userName"

// UserIDFromContext extracts the authenticated user's OIDC `sub` claim
// from the request context. Returns empty string if not authenticated.
func UserIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(userIDKey).(string); ok {
		return v
	}
	return ""
}

// UserNameFromContext extracts the authenticated user's display name
// from the request context. Falls back to the user ID if not set.
func UserNameFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(userNameKey).(string); ok && v != "" {
		return v
	}
	return UserIDFromContext(ctx)
}

// ExportedUserIDKey returns the context key used to store the user ID.
// This is exported for use in test code that needs to inject user IDs
// into request contexts without going through the full OIDC flow.
func ExportedUserIDKey() contextKey {
	return userIDKey
}

// ExportedUserNameKey returns the context key used to store the display name.
// Exported for test injection without a full OIDC flow.
func ExportedUserNameKey() contextKey {
	return userNameKey
}

// OIDCAuth provides OpenID Connect (OIDC) JWT validation middleware that
// dynamically discovers the issuer's JWKs endpoint via
// .well-known/openid-configuration.
//
// Why go-oidc?
// OpenCloud/oCIS uses standard OIDC discovery. The coreos/go-oidc library
// handles JWK fetching, caching, and automatic key rotation — matching the
// exact pattern used by oCIS services internally. This qualifies under the
// PLAN_INSTRUCTIONS.md Ecosystem Exception clause.
type OIDCAuth struct {
	verifier *oidc.IDTokenVerifier
	logger   zerolog.Logger
	mu       sync.Mutex
	ready    bool

	issuerURL string
}

// NewOIDCAuth creates a new OIDC authentication middleware.
// The issuerURL should be the OpenCloud instance URL (e.g., https://cloud.opencloud.test).
// Provider discovery is deferred until the first request to handle startup ordering
// (the OpenCloud container may not be ready when the sidecar boots).
func NewOIDCAuth(issuerURL string, logger zerolog.Logger) *OIDCAuth {
	return &OIDCAuth{
		issuerURL: issuerURL,
		logger:    logger,
	}
}

// initProvider performs lazy OIDC provider discovery on first use.
// Unlike sync.Once, this allows retrying if discovery initially fails
// (e.g., if OpenCloud hasn't finished booting when the sidecar starts).
func (a *OIDCAuth) initProvider(ctx context.Context) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.ready {
		return nil
	}

	a.logger.Info().Str("issuer", a.issuerURL).Msg("discovering OIDC provider")

	provider, err := oidc.NewProvider(ctx, a.issuerURL)
	if err != nil {
		a.logger.Error().Err(err).Msg("OIDC discovery failed")
		return fmt.Errorf("OIDC provider discovery failed for %s: %w", a.issuerURL, err)
	}

	// Skip client ID verification since the OpenCloud proxy already
	// performed the full OAuth2 flow. We only need to verify the
	// cryptographic signature and expiration of the forwarded JWT.
	a.verifier = provider.Verifier(&oidc.Config{
		SkipClientIDCheck: true,
	})

	a.ready = true
	a.logger.Info().Msg("OIDC provider discovered successfully")
	return nil
}

// Middleware returns an http.Handler wrapper that validates the Bearer token
// on every request and injects the `sub` claim into the request context.
func (a *OIDCAuth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract Bearer token from Authorization header.
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error_code":"ERR_AUTH_MISSING","message":"authorization header required"}`, http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			http.Error(w, `{"error_code":"ERR_AUTH_MALFORMED","message":"invalid authorization header format"}`, http.StatusUnauthorized)
			return
		}
		rawToken := parts[1]

		// Lazy-initialize the OIDC provider.
		if err := a.initProvider(r.Context()); err != nil {
			a.logger.Error().Err(err).Msg("OIDC provider not available")
			http.Error(w, `{"error_code":"ERR_AUTH_UNAVAILABLE","message":"authentication service unavailable"}`, http.StatusServiceUnavailable)
			return
		}

		// Verify the JWT signature and expiration against cached JWKs.
		idToken, err := a.verifier.Verify(r.Context(), rawToken)
		if err != nil {
			a.logger.Debug().Err(err).Msg("token verification failed")
			http.Error(w, `{"error_code":"ERR_AUTH_INVALID","message":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		// Extract the `sub` claim — the only PII we persist,
		// per PRIVACY_ASSESSMENT.md Section 3.
		userID := idToken.Subject
		if userID == "" {
			http.Error(w, `{"error_code":"ERR_AUTH_NO_SUBJECT","message":"token missing subject claim"}`, http.StatusUnauthorized)
			return
		}

		// Extract display name for comment attribution.
		// OpenCloud stores the human-readable username in the custom "lg.i" claim (un field).
		// Priority: preferred_username > lg.i.un > name > sub.
		var claims struct {
			PreferredUsername string `json:"preferred_username"`
			Name              string `json:"name"`
			LGIdentity        struct {
				Username string `json:"un"`
			} `json:"lg.i"`
		}
		userName := userID
		if err := idToken.Claims(&claims); err == nil {
			switch {
			case claims.PreferredUsername != "":
				userName = claims.PreferredUsername
			case claims.LGIdentity.Username != "":
				userName = claims.LGIdentity.Username
			case claims.Name != "":
				userName = claims.Name
			}
		}

		// Inject the user ID and display name into the request context.
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		ctx = context.WithValue(ctx, userNameKey, userName)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
