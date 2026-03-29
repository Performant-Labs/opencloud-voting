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
