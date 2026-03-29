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
func (s *VotingStore) ListFeatures(ctx context.Context) ([]Feature, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			f.id, f.title, f.description, f.created_by, f.created_at,
			COUNT(v.user_id) AS vote_count
		FROM voting_features f
		LEFT JOIN voting_votes v ON f.id = v.feature_id
		GROUP BY f.id
		ORDER BY vote_count DESC, f.created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list features: %w", err)
	}
	defer rows.Close()

	var features []Feature
	for rows.Next() {
		var f Feature
		if err := rows.Scan(&f.ID, &f.Title, &f.Description, &f.CreatedBy, &f.CreatedAt, &f.VoteCount); err != nil {
			return nil, fmt.Errorf("scan feature row: %w", err)
		}
		features = append(features, f)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate feature rows: %w", err)
	}

	return features, nil
}

// CreateFeature inserts a new feature and returns its generated ID.
// The createdBy parameter must be the OIDC `sub` claim, never
// preferred_username or email, per PRIVACY_ASSESSMENT.md.
func (s *VotingStore) CreateFeature(ctx context.Context, id, title, description, createdBy string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO voting_features (id, title, description, created_by) VALUES (?, ?, ?, ?)`,
		id, title, description, createdBy,
	)
	if err != nil {
		return fmt.Errorf("create feature: %w", err)
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

	// Check if the feature exists.
	var exists int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM voting_features WHERE id = ?`, featureID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("toggle vote feature lookup: %w", err)
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

	// Delete all features created by this user (cascade deletes votes on those features).
	if _, err := tx.ExecContext(ctx, `DELETE FROM voting_features WHERE created_by = ?`, userID); err != nil {
		return fmt.Errorf("delete user features: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("delete user data commit: %w", err)
	}

	s.logger.Info().Str("user_id", userID).Msg("user data erased (GDPR)")
	return nil
}
