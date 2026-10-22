package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	backupPrefix = "droommd-"
	backupSuffix = ".db"
)

// Backup writes a consistent copy of the database into dir and returns its path.
//
// It uses VACUUM INTO, which snapshots the database while the server keeps running; copying
// the .db file directly could catch it mid-write. The copy is written under a temporary
// name and renamed, so a crash never leaves a half-written file that looks like a backup.
func (s *Store) Backup(ctx context.Context, dir string, now time.Time) (string, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", fmt.Errorf("creating backup directory: %w", err)
	}
	final := filepath.Join(dir, backupPrefix+now.UTC().Format("20060102-150405")+backupSuffix)
	tmp := final + ".partial"
	_ = os.Remove(tmp)

	if _, err := s.db.ExecContext(ctx, `VACUUM INTO ?`, tmp); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("backing up: %w", err)
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	return final, nil
}

// backups lists the backup files in dir, oldest first (the names sort by time).
func backups(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var names []string
	for _, e := range entries {
		n := e.Name()
		if !e.IsDir() && strings.HasPrefix(n, backupPrefix) && strings.HasSuffix(n, backupSuffix) {
			names = append(names, n)
		}
	}
	sort.Strings(names)
	return names, nil
}

// BackupIfDue makes a backup unless the newest one is younger than every, then deletes all
// but the newest keep backups. It reports whether it made one.
func (s *Store) BackupIfDue(ctx context.Context, dir string, every time.Duration, keep int, now time.Time) (bool, error) {
	existing, err := backups(dir)
	if err != nil {
		return false, err
	}

	made := false
	if len(existing) > 0 {
		if info, err := os.Stat(filepath.Join(dir, existing[len(existing)-1])); err == nil && now.Sub(info.ModTime()) < every {
			return false, nil
		}
	}
	if _, err := s.Backup(ctx, dir, now); err != nil {
		return false, err
	}
	made = true

	// Prune: keep the newest `keep` files.
	existing, err = backups(dir)
	if err != nil {
		return made, err
	}
	for len(existing) > keep {
		if err := os.Remove(filepath.Join(dir, existing[0])); err != nil {
			return made, err
		}
		existing = existing[1:]
	}
	return made, nil
}
