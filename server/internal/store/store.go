// Package store persists users' saved places in SQLite.
//
// It uses a pure-Go driver (no cgo), so the server stays a single static binary that
// can be cross-compiled for a VPS. The database is one file; WAL mode keeps readers
// and the single writer from blocking each other.
package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

// Place mirrors the client's Place type.
type Place struct {
	ID      string  `json:"id"`
	Kind    string  `json:"kind"` // home | work | custom
	Label   string  `json:"label"`
	Address string  `json:"address,omitempty"`
	Icon    string  `json:"icon,omitempty"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
}

// Limits that keep one account from filling the disk.
const (
	MaxPlacesPerUser = 50
	maxLabelLen      = 80
	maxAddressLen    = 200
	maxIconLen       = 24
)

// ErrInvalid wraps a problem with data the caller sent.
var ErrInvalid = errors.New("invalid place")

// ErrLimit is returned when a user already has the maximum number of places.
var ErrLimit = fmt.Errorf("a user can save at most %d places", MaxPlacesPerUser)

type Store struct {
	db *sql.DB
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
	id           TEXT PRIMARY KEY,           -- "tg:<telegram id>" or "anon:<hash>"
	created_at   INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS places (
	id         TEXT PRIMARY KEY,
	user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind       TEXT NOT NULL CHECK (kind IN ('home', 'work', 'custom')),
	label      TEXT NOT NULL,
	address    TEXT NOT NULL DEFAULT '',
	icon       TEXT NOT NULL DEFAULT '',
	lat        REAL NOT NULL,
	lng        REAL NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS places_by_user ON places(user_id);
-- one home and one work per user
CREATE UNIQUE INDEX IF NOT EXISTS one_home_work
	ON places(user_id, kind) WHERE kind IN ('home', 'work');
`

// Open opens (creating it if needed) the database at path and applies the schema.
func Open(path string) (*Store, error) {
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			return nil, fmt.Errorf("creating database directory: %w", err)
		}
	}

	// busy_timeout waits instead of failing when another connection holds the write lock.
	dsn := path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite has one writer; a small pool avoids lock contention for this workload.
	db.SetMaxOpenConns(4)

	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("applying schema: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// Ping checks that the database answers; used by the health check.
func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

// Touch records that a user was seen, creating the account on first contact.
func (s *Store) Touch(ctx context.Context, userID string) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users (id, created_at, last_seen_at) VALUES (?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
		userID, now, now)
	return err
}

// Places lists a user's saved places, oldest first.
func (s *Store) Places(ctx context.Context, userID string) ([]Place, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, kind, label, address, icon, lat, lng
		FROM places WHERE user_id = ? ORDER BY created_at, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	places := []Place{}
	for rows.Next() {
		var p Place
		if err := rows.Scan(&p.ID, &p.Kind, &p.Label, &p.Address, &p.Icon, &p.Lat, &p.Lng); err != nil {
			return nil, err
		}
		places = append(places, p)
	}
	return places, rows.Err()
}

// Validate checks a place from a client and returns it cleaned up.
func Validate(p Place) (Place, error) {
	p.Label = strings.TrimSpace(p.Label)
	p.Address = strings.TrimSpace(p.Address)
	p.Icon = strings.TrimSpace(p.Icon)

	switch {
	case p.Kind != "home" && p.Kind != "work" && p.Kind != "custom":
		return p, fmt.Errorf("%w: kind must be home, work or custom", ErrInvalid)
	case p.Label == "" || len([]rune(p.Label)) > maxLabelLen:
		return p, fmt.Errorf("%w: label must be 1-%d characters", ErrInvalid, maxLabelLen)
	case len([]rune(p.Address)) > maxAddressLen:
		return p, fmt.Errorf("%w: address is too long", ErrInvalid)
	case len([]rune(p.Icon)) > maxIconLen:
		return p, fmt.Errorf("%w: icon is too long", ErrInvalid)
	case math.IsNaN(p.Lat) || math.IsNaN(p.Lng) || p.Lat < -90 || p.Lat > 90 || p.Lng < -180 || p.Lng > 180:
		return p, fmt.Errorf("%w: coordinates out of range", ErrInvalid)
	}
	return p, nil
}

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err) // the system's random source failing is not recoverable
	}
	return "p_" + hex.EncodeToString(b)
}

// SavePlace stores a place for a user and returns it with its id. Saving a home or
// work place replaces the previous one of that kind.
func (s *Store) SavePlace(ctx context.Context, userID string, p Place) (Place, error) {
	p, err := Validate(p)
	if err != nil {
		return p, err
	}
	p.ID = newID()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return p, err
	}
	defer tx.Rollback()

	now := time.Now().Unix()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO users (id, created_at, last_seen_at) VALUES (?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`, userID, now, now); err != nil {
		return p, err
	}

	if p.Kind != "custom" {
		if _, err := tx.ExecContext(ctx, `DELETE FROM places WHERE user_id = ? AND kind = ?`, userID, p.Kind); err != nil {
			return p, err
		}
	}

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM places WHERE user_id = ?`, userID).Scan(&count); err != nil {
		return p, err
	}
	if count >= MaxPlacesPerUser {
		return p, ErrLimit
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO places (id, user_id, kind, label, address, icon, lat, lng, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, userID, p.Kind, p.Label, p.Address, p.Icon, p.Lat, p.Lng, now); err != nil {
		return p, err
	}
	return p, tx.Commit()
}

// DeletePlace removes one of the user's places. It reports whether anything was removed,
// so a user can't delete (or even detect) someone else's place by id.
func (s *Store) DeletePlace(ctx context.Context, userID, placeID string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM places WHERE id = ? AND user_id = ?`, placeID, userID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// DeleteUser erases a user and everything stored for them.
func (s *Store) DeleteUser(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, userID)
	return err
}
