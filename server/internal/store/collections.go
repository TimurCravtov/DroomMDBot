package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Collection is a named list of routes a user wants quick access to, such as the lines
// they take to work. Route ids are those of the transit feed.
type Collection struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	RouteIDs []string `json:"routeIds"`
}

const (
	MaxCollectionsPerUser  = 30
	MaxRoutesPerCollection = 60
	maxCollectionNameLen   = 40
	maxRouteIDLen          = 32
)

// ErrCollectionLimit is returned when a user already has the maximum number of collections.
var ErrCollectionLimit = fmt.Errorf("a user can have at most %d collections", MaxCollectionsPerUser)

// ValidateCollection checks a collection from a client and returns it cleaned up: the name
// trimmed, and route ids trimmed and de-duplicated in their original order.
func ValidateCollection(c Collection) (Collection, error) {
	c.Name = strings.TrimSpace(c.Name)
	if c.Name == "" || len([]rune(c.Name)) > maxCollectionNameLen {
		return c, fmt.Errorf("%w: name must be 1-%d characters", ErrInvalid, maxCollectionNameLen)
	}
	if len(c.RouteIDs) == 0 || len(c.RouteIDs) > MaxRoutesPerCollection {
		return c, fmt.Errorf("%w: a collection needs 1-%d routes", ErrInvalid, MaxRoutesPerCollection)
	}
	seen := make(map[string]bool, len(c.RouteIDs))
	ids := make([]string, 0, len(c.RouteIDs))
	for _, id := range c.RouteIDs {
		id = strings.TrimSpace(id)
		if id == "" || len(id) > maxRouteIDLen {
			return c, fmt.Errorf("%w: invalid route id", ErrInvalid)
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	c.RouteIDs = ids
	return c, nil
}

func newCollectionID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err) // the system's random source failing is not recoverable
	}
	return "c_" + hex.EncodeToString(b)
}

// Collections lists a user's collections, oldest first.
func (s *Store) Collections(ctx context.Context, userID string) ([]Collection, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, route_ids FROM route_collections
		WHERE user_id = ? ORDER BY created_at, rowid`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	collections := []Collection{}
	for rows.Next() {
		var c Collection
		var ids string
		if err := rows.Scan(&c.ID, &c.Name, &ids); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(ids), &c.RouteIDs); err != nil {
			return nil, fmt.Errorf("collection %s: %w", c.ID, err)
		}
		collections = append(collections, c)
	}
	return collections, rows.Err()
}

// SaveCollection stores a new collection for a user and returns it with its id.
func (s *Store) SaveCollection(ctx context.Context, userID string, c Collection) (Collection, error) {
	c, err := ValidateCollection(c)
	if err != nil {
		return c, err
	}
	c.ID = newCollectionID()
	ids, _ := json.Marshal(c.RouteIDs)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return c, err
	}
	defer tx.Rollback()

	now := time.Now().Unix()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO users (id, created_at, last_seen_at) VALUES (?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`, userID, now, now); err != nil {
		return c, err
	}

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM route_collections WHERE user_id = ?`, userID).Scan(&count); err != nil {
		return c, err
	}
	if count >= MaxCollectionsPerUser {
		return c, ErrCollectionLimit
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO route_collections (id, user_id, name, route_ids, created_at)
		VALUES (?, ?, ?, ?, ?)`, c.ID, userID, c.Name, string(ids), now); err != nil {
		return c, err
	}
	return c, tx.Commit()
}

// UpdateCollection renames a collection and replaces its routes. It reports whether the
// user has such a collection, so another user's ids are indistinguishable from missing ones.
func (s *Store) UpdateCollection(ctx context.Context, userID string, c Collection) (Collection, bool, error) {
	c, err := ValidateCollection(c)
	if err != nil {
		return c, false, err
	}
	ids, _ := json.Marshal(c.RouteIDs)
	res, err := s.db.ExecContext(ctx, `
		UPDATE route_collections SET name = ?, route_ids = ? WHERE id = ? AND user_id = ?`,
		c.Name, string(ids), c.ID, userID)
	if err != nil {
		return c, false, err
	}
	n, err := res.RowsAffected()
	return c, n > 0, err
}

// DeleteCollection removes one of the user's collections and reports whether it existed.
func (s *Store) DeleteCollection(ctx context.Context, userID, id string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM route_collections WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}
