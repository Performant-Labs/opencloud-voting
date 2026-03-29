package main

import "time"

// Feature represents a user-submitted feature request.
// The CreatedBy field stores the OIDC `sub` claim exclusively —
// never `preferred_username` or `email` — per PRIVACY_ASSESSMENT.md
// Section 3 (GDPR data minimization).
type Feature struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	VoteCount   int       `json:"vote_count"`
	Voted       bool      `json:"voted"`
}

// Vote represents a single user's vote on a feature.
// The composite primary key (FeatureID, UserID) prevents duplicate
// votes at the database schema level.
type Vote struct {
	FeatureID string    `json:"feature_id"`
	UserID    string    `json:"user_id"`
	VotedAt   time.Time `json:"voted_at"`
}

// CreateFeatureRequest is the expected JSON body for POST /api/voting/features.
type CreateFeatureRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

// ErrorResponse is the standard JSON error envelope.
// The Code field contains a machine-readable error code (e.g., ERR_VOTE_DUPLICATE)
// that the Vue frontend maps to localized strings via $gettext() —
// per INTERNATIONALIZE.md Section 2 (Strict Separation of Concerns).
type ErrorResponse struct {
	Code    string `json:"error_code"`
	Message string `json:"message"`
}

// FeatureListResponse wraps the feature list for JSON serialization.
type FeatureListResponse struct {
	Features []Feature `json:"features"`
	Total    int       `json:"total"`
}
