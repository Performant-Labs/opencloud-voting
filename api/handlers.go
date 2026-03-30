package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/opencloud-eu/opencloud-voting/api/middleware"
	"github.com/rs/zerolog"
)

// VotingHandler provides the HTTP handlers for the voting API.
type VotingHandler struct {
	store  *VotingStore
	logger zerolog.Logger
}

// NewVotingHandler creates a new handler backed by the given store.
func NewVotingHandler(store *VotingStore, logger zerolog.Logger) *VotingHandler {
	return &VotingHandler{store: store, logger: logger}
}

// RegisterRoutes mounts the voting API endpoints onto the given ServeMux.
// All routes require the OpenID Connect (OIDC) auth middleware to have
// already injected the user ID into the request context.
func (h *VotingHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/voting/features", h.listFeatures)
	mux.HandleFunc("POST /api/voting/features", h.createFeature)
	mux.HandleFunc("DELETE /api/voting/features/{id}", h.deleteFeature)
	mux.HandleFunc("POST /api/voting/features/{id}/vote", h.toggleVote)
	mux.HandleFunc("GET /api/voting/features/{id}/comments", h.listComments)
	mux.HandleFunc("POST /api/voting/features/{id}/comments", h.createComment)
	mux.HandleFunc("DELETE /api/voting/features/{id}/comments/{commentId}", h.deleteComment)
}

// listFeatures handles GET /api/voting/features (Step 510).
func (h *VotingHandler) listFeatures(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	features, err := h.store.ListFeatures(r.Context(), userID)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to list features")
		h.logger.Error().Err(err).Msg("list features failed")
		return
	}

	if features == nil {
		features = []Feature{}
	}

	h.respondJSON(w, http.StatusOK, FeatureListResponse{
		Features: features,
		Total:    len(features),
	})
}

// createFeature handles POST /api/voting/features (Step 520).
func (h *VotingHandler) createFeature(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		h.respondError(w, http.StatusUnauthorized, "ERR_AUTH_REQUIRED", "authentication required")
		return
	}

	var req CreateFeatureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "ERR_INVALID_JSON", "invalid request body")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)

	if req.Title == "" {
		h.respondError(w, http.StatusBadRequest, "ERR_TITLE_EMPTY", "title is required")
		return
	}
	if len(req.Title) > 255 {
		h.respondError(w, http.StatusBadRequest, "ERR_TITLE_TOO_LONG", "title must not exceed 255 characters")
		return
	}

	count, err := h.store.CountFeatures(r.Context())
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to check feature capacity limit")
		h.logger.Error().Err(err).Msg("feature capacity check failed")
		return
	}
	if count >= 2500 {
		h.respondError(w, http.StatusForbidden, "ERR_LIMIT_REACHED", "The feature board has reached its maximum capacity of 2,500 requests.")
		return
	}

	exists, err := h.store.FeatureExists(r.Context(), req.Title)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to check feature existence")
		h.logger.Error().Err(err).Msg("feature existence check failed")
		return
	}
	if exists {
		h.respondError(w, http.StatusConflict, "ERR_TITLE_EXISTS", "A feature with this exact name already exists. Please vote for the existing one instead.")
		return
	}

	id, err := generateID()
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to generate ID")
		h.logger.Error().Err(err).Msg("generate ID failed")
		return
	}

	if err := h.store.CreateFeature(r.Context(), id, req.Title, req.Description, userID); err != nil {
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to create feature")
		h.logger.Error().Err(err).Msg("create feature failed")
		return
	}

	h.logger.Info().Str("feature_id", id).Str("user_id", userID).Msg("feature created")
	h.respondJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// deleteFeature handles DELETE /api/voting/features/{id} (Step 530).
func (h *VotingHandler) deleteFeature(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		h.respondError(w, http.StatusUnauthorized, "ERR_AUTH_REQUIRED", "authentication required")
		return
	}

	featureID := r.PathValue("id")
	if featureID == "" {
		h.respondError(w, http.StatusBadRequest, "ERR_MISSING_ID", "feature ID is required")
		return
	}

	deleted, err := h.store.DeleteFeature(r.Context(), featureID, userID)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to delete feature")
		h.logger.Error().Err(err).Msg("delete feature failed")
		return
	}

	if !deleted {
		h.respondError(w, http.StatusForbidden, "ERR_NOT_OWNER", "you can only delete features you created")
		return
	}

	h.logger.Info().Str("feature_id", featureID).Str("user_id", userID).Msg("feature deleted")
	w.WriteHeader(http.StatusNoContent)
}

// toggleVote handles POST /api/voting/features/{id}/vote (Step 540).
func (h *VotingHandler) toggleVote(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		h.respondError(w, http.StatusUnauthorized, "ERR_AUTH_REQUIRED", "authentication required")
		return
	}

	featureID := r.PathValue("id")
	if featureID == "" {
		h.respondError(w, http.StatusBadRequest, "ERR_MISSING_ID", "feature ID is required")
		return
	}

	voted, err := h.store.ToggleVote(r.Context(), featureID, userID)
	if err != nil {
		if strings.Contains(err.Error(), "feature lookup") {
			h.respondError(w, http.StatusNotFound, "ERR_FEATURE_NOT_FOUND", "feature not found")
			return
		}
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to toggle vote")
		h.logger.Error().Err(err).Msg("toggle vote failed")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]bool{"voted": voted})
}

// listComments handles GET /api/voting/features/{id}/comments.
func (h *VotingHandler) listComments(w http.ResponseWriter, r *http.Request) {
	featureID := r.PathValue("id")
	if featureID == "" {
		h.respondError(w, http.StatusBadRequest, "ERR_MISSING_ID", "feature ID is required")
		return
	}

	comments, err := h.store.ListComments(r.Context(), featureID)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to list comments")
		h.logger.Error().Err(err).Str("feature_id", featureID).Msg("list comments failed")
		return
	}

	if comments == nil {
		comments = []Comment{}
	}

	h.respondJSON(w, http.StatusOK, CommentListResponse{
		Comments: comments,
		Total:    len(comments),
	})
}

// createComment handles POST /api/voting/features/{id}/comments.
func (h *VotingHandler) createComment(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		h.respondError(w, http.StatusUnauthorized, "ERR_AUTH_REQUIRED", "authentication required")
		return
	}

	featureID := r.PathValue("id")
	if featureID == "" {
		h.respondError(w, http.StatusBadRequest, "ERR_MISSING_ID", "feature ID is required")
		return
	}

	var req CreateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "ERR_INVALID_JSON", "invalid request body")
		return
	}

	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		h.respondError(w, http.StatusBadRequest, "ERR_BODY_EMPTY", "comment body is required")
		return
	}
	if len(req.Body) > 2000 {
		h.respondError(w, http.StatusBadRequest, "ERR_BODY_TOO_LONG", "comment must not exceed 2000 characters")
		return
	}

	id, err := generateID()
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to generate ID")
		h.logger.Error().Err(err).Msg("generate ID failed")
		return
	}

	userName := middleware.UserNameFromContext(r.Context())
	if err := h.store.CreateComment(r.Context(), id, featureID, userID, userName, req.Body); err != nil {
		if strings.Contains(err.Error(), "feature not found") {
			h.respondError(w, http.StatusNotFound, "ERR_FEATURE_NOT_FOUND", "feature not found")
			return
		}
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to create comment")
		h.logger.Error().Err(err).Str("feature_id", featureID).Msg("create comment failed")
		return
	}

	h.logger.Info().Str("comment_id", id).Str("feature_id", featureID).Str("user_id", userID).Msg("comment created")
	h.respondJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// deleteComment handles DELETE /api/voting/features/{id}/comments/{commentId}.
func (h *VotingHandler) deleteComment(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		h.respondError(w, http.StatusUnauthorized, "ERR_AUTH_REQUIRED", "authentication required")
		return
	}

	commentID := r.PathValue("commentId")
	if commentID == "" {
		h.respondError(w, http.StatusBadRequest, "ERR_MISSING_ID", "comment ID is required")
		return
	}

	deleted, err := h.store.DeleteComment(r.Context(), commentID, userID)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "ERR_INTERNAL", "failed to delete comment")
		h.logger.Error().Err(err).Str("comment_id", commentID).Msg("delete comment failed")
		return
	}

	if !deleted {
		h.respondError(w, http.StatusForbidden, "ERR_NOT_OWNER", "you can only delete comments you posted")
		return
	}

	h.logger.Info().Str("comment_id", commentID).Str("user_id", userID).Msg("comment deleted")
	w.WriteHeader(http.StatusNoContent)
}

// respondJSON writes a JSON response with the given status code.
func (h *VotingHandler) respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		h.logger.Error().Err(err).Msg("failed to encode JSON response")
	}
}

// respondError writes a JSON error response using the standard ErrorResponse
// envelope. Error codes are machine-readable for vue3-gettext frontend mapping.
func (h *VotingHandler) respondError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(ErrorResponse{Code: code, Message: message})
}

// generateID produces a cryptographically random 16-byte hex string.
func generateID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate random ID: %w", err)
	}
	return hex.EncodeToString(b), nil
}
