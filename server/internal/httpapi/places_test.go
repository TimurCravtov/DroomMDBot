package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"droommd/server/internal/config"
	"droommd/server/internal/store"
)

const (
	alice = "anon alice-token-abcdefghijklmnopqrstuvwxyz"
	bob   = "anon bobs-token-abcdefghijklmnopqrstuvwxyz12"
)

func testServer(t *testing.T) http.Handler {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{AllowAnon: true, BotToken: "1:test", AuthMaxAge: time.Hour}
	// Only the per-user endpoints are exercised, which need nothing but the store.
	return New(cfg, Deps{Store: db}).Handler()
}

func call(h http.Handler, method, path, authorization, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if authorization != "" {
		r.Header.Set("Authorization", authorization)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func decodePlaces(t *testing.T, rec *httptest.ResponseRecorder) []store.Place {
	t.Helper()
	var places []store.Place
	if err := json.Unmarshal(rec.Body.Bytes(), &places); err != nil {
		t.Fatalf("response is not a list of places: %v (%s)", err, rec.Body.String())
	}
	return places
}

const home = `{"kind":"home","label":"Home","lat":47.02,"lng":28.83,"address":"Str. X 1"}`

func TestPlacesRequireAuthentication(t *testing.T) {
	h := testServer(t)
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/me/places"}, {"POST", "/api/me/places"},
		{"DELETE", "/api/me/places/p_1"}, {"DELETE", "/api/me"},
	} {
		if rec := call(h, c.method, c.path, "", home); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without credentials: status %d, want 401", c.method, c.path, rec.Code)
		}
	}
	if rec := call(h, "GET", "/api/me/places", "anon too-short", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("malformed token: status %d, want 401", rec.Code)
	}
}

func TestSaveListAndDeleteAPlace(t *testing.T) {
	h := testServer(t)

	if rec := call(h, "GET", "/api/me/places", alice, ""); rec.Code != http.StatusOK || len(decodePlaces(t, rec)) != 0 {
		t.Fatalf("a new user should start with an empty list, got %d %s", rec.Code, rec.Body.String())
	}

	rec := call(h, "POST", "/api/me/places", alice, home)
	if rec.Code != http.StatusCreated {
		t.Fatalf("save: status %d: %s", rec.Code, rec.Body.String())
	}
	var saved store.Place
	json.Unmarshal(rec.Body.Bytes(), &saved)
	if saved.ID == "" || saved.Label != "Home" || saved.Address != "Str. X 1" {
		t.Errorf("saved place = %+v", saved)
	}

	if got := decodePlaces(t, call(h, "GET", "/api/me/places", alice, "")); len(got) != 1 || got[0].ID != saved.ID {
		t.Errorf("list = %+v, want the saved place", got)
	}

	if rec := call(h, "DELETE", "/api/me/places/"+saved.ID, alice, ""); rec.Code != http.StatusNoContent {
		t.Errorf("delete: status %d, want 204", rec.Code)
	}
	if rec := call(h, "DELETE", "/api/me/places/"+saved.ID, alice, ""); rec.Code != http.StatusNotFound {
		t.Errorf("deleting again: status %d, want 404", rec.Code)
	}
}

func TestUsersCannotSeeOrTouchEachOthersPlaces(t *testing.T) {
	h := testServer(t)
	rec := call(h, "POST", "/api/me/places", alice, home)
	var saved store.Place
	json.Unmarshal(rec.Body.Bytes(), &saved)

	if got := decodePlaces(t, call(h, "GET", "/api/me/places", bob, "")); len(got) != 0 {
		t.Errorf("bob sees alice's places: %+v", got)
	}
	if rec := call(h, "DELETE", "/api/me/places/"+saved.ID, bob, ""); rec.Code != http.StatusNotFound {
		t.Errorf("bob deleting alice's place: status %d, want 404", rec.Code)
	}
	if got := decodePlaces(t, call(h, "GET", "/api/me/places", alice, "")); len(got) != 1 {
		t.Error("alice's place was affected by bob")
	}
}

func TestSaveRejectsBadRequests(t *testing.T) {
	h := testServer(t)
	for name, body := range map[string]string{
		"not json":     `nope`,
		"unknown kind": `{"kind":"pin","label":"x","lat":1,"lng":1}`,
		"no label":     `{"kind":"custom","label":"","lat":1,"lng":1}`,
		"bad latitude": `{"kind":"custom","label":"x","lat":123,"lng":1}`,
		"oversized":    `{"kind":"custom","label":"` + strings.Repeat("x", 8000) + `","lat":1,"lng":1}`,
	} {
		if rec := call(h, "POST", "/api/me/places", alice, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, rec.Code)
		}
	}
}

func TestClientCannotChooseItsOwnPlaceID(t *testing.T) {
	h := testServer(t)
	rec := call(h, "POST", "/api/me/places", alice, `{"id":"p_chosen","kind":"custom","label":"x","lat":1,"lng":1}`)
	var saved store.Place
	json.Unmarshal(rec.Body.Bytes(), &saved)
	if saved.ID == "p_chosen" || saved.ID == "" {
		t.Errorf("id = %q, want one assigned by the server", saved.ID)
	}
}

func TestPlaceLimitIsReportedAsConflict(t *testing.T) {
	h := testServer(t)
	body := `{"kind":"custom","label":"p","lat":1,"lng":1}`
	for i := 0; i < store.MaxPlacesPerUser; i++ {
		if rec := call(h, "POST", "/api/me/places", alice, body); rec.Code != http.StatusCreated {
			t.Fatalf("place %d: status %d", i, rec.Code)
		}
	}
	if rec := call(h, "POST", "/api/me/places", alice, body); rec.Code != http.StatusConflict {
		t.Errorf("over the limit: status %d, want 409", rec.Code)
	}
}

func TestDeleteMeErasesTheAccount(t *testing.T) {
	h := testServer(t)
	call(h, "POST", "/api/me/places", alice, home)
	call(h, "POST", "/api/me/places", bob, home)

	if rec := call(h, "DELETE", "/api/me", alice, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("status %d, want 204", rec.Code)
	}
	if got := decodePlaces(t, call(h, "GET", "/api/me/places", alice, "")); len(got) != 0 {
		t.Errorf("data survived account deletion: %+v", got)
	}
	if got := decodePlaces(t, call(h, "GET", "/api/me/places", bob, "")); len(got) != 1 {
		t.Error("deleting one account touched another")
	}
}
