package store

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBackupIsARestorableCopy(t *testing.T) {
	s := open(t)
	s.SavePlace(ctx, "tg:1", Place{Kind: "home", Label: "Home", Lat: 47, Lng: 28})
	dir := filepath.Join(t.TempDir(), "backups")

	path, err := s.Backup(ctx, dir, time.Date(2026, 10, 22, 3, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(path) != "droommd-20261022-030000.db" {
		t.Errorf("backup name = %s", filepath.Base(path))
	}

	// Open the copy as a database of its own: it must hold the data.
	restored, err := Open(path)
	if err != nil {
		t.Fatalf("backup is not a valid database: %v", err)
	}
	defer restored.Close()
	if got, _ := restored.Places(ctx, "tg:1"); len(got) != 1 || got[0].Label != "Home" {
		t.Errorf("restored places = %+v", got)
	}

	// No half-written files are left behind.
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".partial" {
			t.Errorf("leftover temporary file %s", e.Name())
		}
	}
}

func TestBackupIfDueRespectsTheIntervalAndRetention(t *testing.T) {
	s := open(t)
	dir := t.TempDir()
	start := time.Date(2026, 10, 1, 3, 0, 0, 0, time.UTC)

	// Make five daily backups, backdating each file so "age" works as it would in real time.
	for day := 0; day < 5; day++ {
		now := start.AddDate(0, 0, day)
		made, err := s.BackupIfDue(ctx, dir, 24*time.Hour, 3, now)
		if err != nil || !made {
			t.Fatalf("day %d: made=%v err=%v, want a new backup", day, made, err)
		}
		files, _ := backups(dir)
		os.Chtimes(filepath.Join(dir, files[len(files)-1]), now, now)
	}

	files, _ := backups(dir)
	if len(files) != 3 {
		t.Fatalf("kept %d backups, want the newest 3: %v", len(files), files)
	}
	if files[0] != "droommd-20261003-030000.db" || files[2] != "droommd-20261005-030000.db" {
		t.Errorf("kept %v, want October 3rd to 5th", files)
	}

	// An hour later nothing is due.
	made, err := s.BackupIfDue(ctx, dir, 24*time.Hour, 3, start.AddDate(0, 0, 4).Add(time.Hour))
	if err != nil || made {
		t.Errorf("made=%v err=%v, want no backup yet", made, err)
	}
}

func TestBackupIfDueIgnoresUnrelatedFiles(t *testing.T) {
	s := open(t)
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("keep me"), 0o600)
	os.WriteFile(filepath.Join(dir, "droommd-20200101-000000.db.partial"), []byte("x"), 0o600)

	if _, err := s.BackupIfDue(ctx, dir, time.Hour, 1, time.Now()); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"notes.txt", "droommd-20200101-000000.db.partial"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("%s was deleted by retention", name)
		}
	}
}
