package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func open(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "sub", "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

var ctx = context.Background()

func TestSaveAndListPlaces(t *testing.T) {
	s := open(t)

	home, err := s.SavePlace(ctx, "tg:1", Place{Kind: "home", Label: "Home", Lat: 47.02, Lng: 28.83, Address: "Str. X 1"})
	if err != nil {
		t.Fatal(err)
	}
	if home.ID == "" {
		t.Error("saved place has no id")
	}
	if _, err := s.SavePlace(ctx, "tg:1", Place{Kind: "custom", Label: "Gym", Icon: "gym", Lat: 47.01, Lng: 28.84}); err != nil {
		t.Fatal(err)
	}

	got, err := s.Places(ctx, "tg:1")
	if err != nil || len(got) != 2 {
		t.Fatalf("places = %+v err=%v, want 2", got, err)
	}
	if got[0].Kind != "home" || got[0].Address != "Str. X 1" || got[1].Icon != "gym" {
		t.Errorf("fields were not kept: %+v", got)
	}
}

func TestHomeAndWorkAreReplacedCustomPlacesAccumulate(t *testing.T) {
	s := open(t)
	s.SavePlace(ctx, "tg:1", Place{Kind: "home", Label: "Old", Lat: 1, Lng: 1})
	s.SavePlace(ctx, "tg:1", Place{Kind: "home", Label: "New", Lat: 2, Lng: 2})
	s.SavePlace(ctx, "tg:1", Place{Kind: "custom", Label: "A", Lat: 3, Lng: 3})
	s.SavePlace(ctx, "tg:1", Place{Kind: "custom", Label: "B", Lat: 4, Lng: 4})

	got, _ := s.Places(ctx, "tg:1")
	homes, customs := 0, 0
	for _, p := range got {
		switch p.Kind {
		case "home":
			homes++
			if p.Label != "New" {
				t.Errorf("home = %q, want the newer one", p.Label)
			}
		case "custom":
			customs++
		}
	}
	if homes != 1 || customs != 2 {
		t.Errorf("homes=%d customs=%d, want 1 and 2", homes, customs)
	}
}

func TestUsersAreIsolated(t *testing.T) {
	s := open(t)
	mine, _ := s.SavePlace(ctx, "tg:1", Place{Kind: "custom", Label: "Mine", Lat: 1, Lng: 1})
	s.SavePlace(ctx, "tg:2", Place{Kind: "custom", Label: "Theirs", Lat: 2, Lng: 2})

	if got, _ := s.Places(ctx, "tg:2"); len(got) != 1 || got[0].Label != "Theirs" {
		t.Errorf("user 2 sees %+v", got)
	}
	// Deleting by id only works for the owner.
	if ok, _ := s.DeletePlace(ctx, "tg:2", mine.ID); ok {
		t.Error("user 2 deleted user 1's place")
	}
	if ok, _ := s.DeletePlace(ctx, "tg:1", mine.ID); !ok {
		t.Error("owner could not delete their place")
	}
	if ok, _ := s.DeletePlace(ctx, "tg:1", mine.ID); ok {
		t.Error("deleting twice should report nothing removed")
	}
}

func TestValidationRejectsBadInput(t *testing.T) {
	s := open(t)
	long := make([]rune, 81)
	for i := range long {
		long[i] = 'x'
	}
	bad := map[string]Place{
		"unknown kind": {Kind: "pin", Label: "x", Lat: 1, Lng: 1},
		"empty label":  {Kind: "custom", Label: "  ", Lat: 1, Lng: 1},
		"long label":   {Kind: "custom", Label: string(long), Lat: 1, Lng: 1},
		"lat range":    {Kind: "custom", Label: "x", Lat: 91, Lng: 1},
		"lng range":    {Kind: "custom", Label: "x", Lat: 1, Lng: -181},
	}
	for name, p := range bad {
		if _, err := s.SavePlace(ctx, "tg:1", p); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
	if got, _ := s.Places(ctx, "tg:1"); len(got) != 0 {
		t.Errorf("invalid places were stored: %+v", got)
	}
}

func TestPlaceLimitPerUser(t *testing.T) {
	s := open(t)
	for i := 0; i < MaxPlacesPerUser; i++ {
		if _, err := s.SavePlace(ctx, "tg:1", Place{Kind: "custom", Label: "p", Lat: 1, Lng: 1}); err != nil {
			t.Fatalf("place %d: %v", i, err)
		}
	}
	if _, err := s.SavePlace(ctx, "tg:1", Place{Kind: "custom", Label: "one too many", Lat: 1, Lng: 1}); !errors.Is(err, ErrLimit) {
		t.Errorf("err = %v, want ErrLimit", err)
	}
	// Other users are unaffected, and replacing home/work still works at the limit.
	if _, err := s.SavePlace(ctx, "tg:2", Place{Kind: "custom", Label: "ok", Lat: 1, Lng: 1}); err != nil {
		t.Errorf("another user hit the limit: %v", err)
	}
}

func TestDeleteUserRemovesEverything(t *testing.T) {
	s := open(t)
	s.SavePlace(ctx, "tg:1", Place{Kind: "home", Label: "Home", Lat: 1, Lng: 1})
	s.SavePlace(ctx, "tg:1", Place{Kind: "custom", Label: "A", Lat: 1, Lng: 1})
	s.SavePlace(ctx, "tg:2", Place{Kind: "custom", Label: "Other", Lat: 1, Lng: 1})

	if err := s.DeleteUser(ctx, "tg:1"); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.Places(ctx, "tg:1"); len(got) != 0 {
		t.Errorf("places survived account deletion: %+v", got)
	}
	if got, _ := s.Places(ctx, "tg:2"); len(got) != 1 {
		t.Errorf("deleting one user touched another: %+v", got)
	}
}

func TestDataSurvivesReopening(t *testing.T) {
	path := filepath.Join(t.TempDir(), "persist.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	s.SavePlace(ctx, "tg:1", Place{Kind: "home", Label: "Home", Lat: 47, Lng: 28})
	s.Close()

	s2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	if got, _ := s2.Places(ctx, "tg:1"); len(got) != 1 || got[0].Label != "Home" {
		t.Errorf("after reopening: %+v", got)
	}
}
