package main

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/rs/zerolog"
)

// VotingStore provides the database operations for the voting API.
// Every method accepts a context.Context as its first parameter
// for timeout cascading, per PLAN_INSTRUCTIONS.md Rule 4.
type VotingStore struct {
	db     *sql.DB
	logger zerolog.Logger
}

// NewVotingStore creates a new store backed by the given database.
func NewVotingStore(db *sql.DB, logger zerolog.Logger) *VotingStore {
	return &VotingStore{db: db, logger: logger}
}

// ListFeatures returns all features with their aggregated vote counts.
// When userID is non-empty, each feature includes a `voted` boolean
// indicating whether that specific user has voted.
func (s *VotingStore) ListFeatures(ctx context.Context, userID string) ([]Feature, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			f.id, f.title, f.description, f.created_by, f.created_at,
			COUNT(DISTINCT v.user_id) AS vote_count,
			CASE WHEN uv.user_id IS NOT NULL THEN 1 ELSE 0 END AS voted,
			(SELECT COUNT(*) FROM voting_comments c WHERE c.feature_id = f.id) AS comment_count
		FROM voting_features f
		LEFT JOIN voting_votes v ON f.id = v.feature_id
		LEFT JOIN voting_votes uv ON f.id = uv.feature_id AND uv.user_id = ?
		GROUP BY f.id
		ORDER BY vote_count DESC, f.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list features: %w", err)
	}
	defer rows.Close()

	var features []Feature
	for rows.Next() {
		var f Feature
		if err := rows.Scan(&f.ID, &f.Title, &f.Description, &f.CreatedBy, &f.CreatedAt, &f.VoteCount, &f.Voted, &f.CommentCount); err != nil {
			return nil, fmt.Errorf("scan feature row: %w", err)
		}
		features = append(features, f)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate feature rows: %w", err)
	}

	return features, nil
}

// CountFeatures returns the total active number of features in the system.
func (s *VotingStore) CountFeatures(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM voting_features").Scan(&count)
	return count, err
}

// FeatureExists checks if a feature with the given name already exists (case-insensitive).
func (s *VotingStore) FeatureExists(ctx context.Context, title string) (bool, error) {
	var exists int
	err := s.db.QueryRowContext(ctx, "SELECT 1 FROM voting_features WHERE LOWER(title) = LOWER(?)", title).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("feature exists check: %w", err)
	}
	return exists == 1, nil
}

// CreateFeature inserts a new feature and auto-votes for the creator.
// The createdBy parameter must be the OIDC `sub` claim, never
// preferred_username or email, per PRIVACY_ASSESSMENT.md.
// The author's implicit vote ensures vote_count is always >= 1.
func (s *VotingStore) CreateFeature(ctx context.Context, id, title, description, createdBy string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("create feature begin tx: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx,
		`INSERT INTO voting_features (id, title, description, created_by) VALUES (?, ?, ?, ?)`,
		id, title, description, createdBy,
	)
	if err != nil {
		return fmt.Errorf("create feature: %w", err)
	}

	// Auto-vote: the creator implicitly supports their own feature.
	_, err = tx.ExecContext(ctx,
		`INSERT INTO voting_votes (feature_id, user_id) VALUES (?, ?)`,
		id, createdBy,
	)
	if err != nil {
		return fmt.Errorf("create feature auto-vote: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("create feature commit: %w", err)
	}
	return nil
}

// DeleteFeature removes a feature only if the requesting user is the
// original creator. Returns true if a row was deleted, false if no
// matching row was found (either the feature doesn't exist or the
// user isn't the owner).
func (s *VotingStore) DeleteFeature(ctx context.Context, featureID, userID string) (bool, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM voting_features WHERE id = ? AND created_by = ?`,
		featureID, userID,
	)
	if err != nil {
		return false, fmt.Errorf("delete feature: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("delete feature rows affected: %w", err)
	}

	return rowsAffected > 0, nil
}

// ToggleVote atomically inserts or removes a vote. Returns true if the
// vote now exists (was added), false if it was removed.
func (s *VotingStore) ToggleVote(ctx context.Context, featureID, userID string) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("toggle vote begin tx: %w", err)
	}
	defer tx.Rollback()

	// Check if the feature exists and who created it.
	var createdBy string
	err = tx.QueryRowContext(ctx, `SELECT created_by FROM voting_features WHERE id = ?`, featureID).Scan(&createdBy)
	if err != nil {
		return false, fmt.Errorf("toggle vote feature lookup: %w", err)
	}

	// The feature creator cannot remove their own vote — it's implicit.
	if createdBy == userID {
		// Check if they already have a vote (from auto-vote on creation).
		var hasVote int
		_ = tx.QueryRowContext(ctx, `SELECT 1 FROM voting_votes WHERE feature_id = ? AND user_id = ?`, featureID, userID).Scan(&hasVote)
		if hasVote == 1 {
			// Already voted as creator — no-op, return current state.
			tx.Commit()
			return true, nil
		}
	}

	// Try to delete an existing vote first.
	result, err := tx.ExecContext(ctx,
		`DELETE FROM voting_votes WHERE feature_id = ? AND user_id = ?`,
		featureID, userID,
	)
	if err != nil {
		return false, fmt.Errorf("toggle vote delete: %w", err)
	}

	rowsDeleted, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("toggle vote rows affected: %w", err)
	}

	if rowsDeleted > 0 {
		// Vote existed and was removed.
		if err := tx.Commit(); err != nil {
			return false, fmt.Errorf("toggle vote commit (unvote): %w", err)
		}
		return false, nil
	}

	// Vote didn't exist — insert it.
	_, err = tx.ExecContext(ctx,
		`INSERT INTO voting_votes (feature_id, user_id) VALUES (?, ?)`,
		featureID, userID,
	)
	if err != nil {
		return false, fmt.Errorf("toggle vote insert: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("toggle vote commit (vote): %w", err)
	}

	return true, nil
}

// ListComments returns all comments for the given feature, oldest first.
func (s *VotingStore) ListComments(ctx context.Context, featureID string) ([]Comment, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, feature_id, user_id, user_name, body, created_at
		FROM voting_comments
		WHERE feature_id = ?
		ORDER BY created_at ASC
	`, featureID)
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	defer rows.Close()

	var comments []Comment
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.ID, &c.FeatureID, &c.UserID, &c.UserName, &c.Body, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan comment row: %w", err)
		}
		comments = append(comments, c)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate comment rows: %w", err)
	}

	return comments, nil
}

// CreateComment inserts a new comment on a feature.
// Returns an error wrapping "feature not found" if the feature does not exist.
func (s *VotingStore) CreateComment(ctx context.Context, id, featureID, userID, userName, body string) error {
	var exists int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM voting_features WHERE id = ?`, featureID).Scan(&exists)
	if err == sql.ErrNoRows {
		return fmt.Errorf("feature not found: %s", featureID)
	}
	if err != nil {
		return fmt.Errorf("create comment feature lookup: %w", err)
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO voting_comments (id, feature_id, user_id, user_name, body) VALUES (?, ?, ?, ?, ?)`,
		id, featureID, userID, userName, body,
	)
	if err != nil {
		return fmt.Errorf("create comment: %w", err)
	}

	return nil
}

// DeleteComment removes a comment only if the requesting user is the author.
// Returns true if a row was deleted, false if not found or not owned by the user.
func (s *VotingStore) DeleteComment(ctx context.Context, commentID, userID string) (bool, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM voting_comments WHERE id = ? AND user_id = ?`,
		commentID, userID,
	)
	if err != nil {
		return false, fmt.Errorf("delete comment: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("delete comment rows affected: %w", err)
	}

	return rowsAffected > 0, nil
}

// DeleteUserData removes all data associated with a user ID.
// Implements GDPR Right to Erasure cascading deletion
// per PRIVACY_ASSESSMENT.md Section 4.
func (s *VotingStore) DeleteUserData(ctx context.Context, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("delete user data begin tx: %w", err)
	}
	defer tx.Rollback()

	// Delete all votes by this user.
	if _, err := tx.ExecContext(ctx, `DELETE FROM voting_votes WHERE user_id = ?`, userID); err != nil {
		return fmt.Errorf("delete user votes: %w", err)
	}

	// Delete all comments by this user.
	if _, err := tx.ExecContext(ctx, `DELETE FROM voting_comments WHERE user_id = ?`, userID); err != nil {
		return fmt.Errorf("delete user comments: %w", err)
	}

	// Delete all features created by this user (cascade deletes votes and comments on those features).
	if _, err := tx.ExecContext(ctx, `DELETE FROM voting_features WHERE created_by = ?`, userID); err != nil {
		return fmt.Errorf("delete user features: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("delete user data commit: %w", err)
	}

	s.logger.Info().Str("user_id", userID).Msg("user data erased (GDPR)")
	return nil
}
