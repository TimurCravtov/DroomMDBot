package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"droommd/server/internal/store"
)

const toWork = `{"name":"To work","routeIds":["1","22","30"]}`

func decodeCollections(t *testing.T, rec *httptest.ResponseRecorder) []store.Collection {
	t.Helper()
	var out []store.Collection
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("response is not a list of collections: %v (%s)", err, rec.Body.String())
	}
	return out
}

func TestCollectionsRequireAuthentication(t *testing.T) {
	h := testServer(t)
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/me/collections"}, {"POST", "/api/me/collections"},
		{"PUT", "/api/me/collections/c_1"}, {"DELETE", "/api/me/collections/c_1"},
	} {
		if rec := call(h, c.method, c.path, "", toWork); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without credentials: status %d, want 401", c.method, c.path, rec.Code)
		}
	}
}

func TestSaveUpdateListAndDeleteACollection(t *testing.T) {
	h := testServer(t)

	rec := call(h, "POST", "/api/me/collections", alice, `{"name":" To work ","routeIds":["1","22","1","30"]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("save: status %d: %s", rec.Code, rec.Body)
	}
	var saved store.Collection
	json.Unmarshal(rec.Body.Bytes(), &saved)
	if saved.ID == "" || saved.Name != "To work" || strings.Join(saved.RouteIDs, ",") != "1,22,30" {
		t.Errorf("saved = %+v, want a trimmed name and de-duplicated routes in order", saved)
	}

	rec = call(h, "PUT", "/api/me/collections/"+saved.ID, alice, `{"name":"Commute","routeIds":["22"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("update: status %d: %s", rec.Code, rec.Body)
	}
	got := decodeCollections(t, call(h, "GET", "/api/me/collections", alice, ""))
	if len(got) != 1 || got[0].ID != saved.ID || got[0].Name != "Commute" || len(got[0].RouteIDs) != 1 {
		t.Errorf("list = %+v, want the updated collection", got)
	}

	if rec := call(h, "DELETE", "/api/me/collections/"+saved.ID, alice, ""); rec.Code != http.StatusNoContent {
		t.Errorf("delete: status %d, want 204", rec.Code)
	}
	if rec := call(h, "DELETE", "/api/me/collections/"+saved.ID, alice, ""); rec.Code != http.StatusNotFound {
		t.Errorf("deleting again: status %d, want 404", rec.Code)
	}
}

func TestUsersCannotSeeOrTouchEachOthersCollections(t *testing.T) {
	h := testServer(t)
	var saved store.Collection
	json.Unmarshal(call(h, "POST", "/api/me/collections", alice, toWork).Body.Bytes(), &saved)

	if got := decodeCollections(t, call(h, "GET", "/api/me/collections", bob, "")); len(got) != 0 {
		t.Errorf("bob sees alice's collections: %+v", got)
	}
	if rec := call(h, "PUT", "/api/me/collections/"+saved.ID, bob, `{"name":"Mine","routeIds":["5"]}`); rec.Code != http.StatusNotFound {
		t.Errorf("bob updating alice's collection: status %d, want 404", rec.Code)
	}
	if rec := call(h, "DELETE", "/api/me/collections/"+saved.ID, bob, ""); rec.Code != http.StatusNotFound {
		t.Errorf("bob deleting alice's collection: status %d, want 404", rec.Code)
	}
	if got := decodeCollections(t, call(h, "GET", "/api/me/collections", alice, "")); len(got) != 1 || got[0].Name != "To work" {
		t.Errorf("alice's collection was affected by bob: %+v", got)
	}
}

func TestSaveCollectionRejectsBadRequests(t *testing.T) {
	h := testServer(t)
	for name, body := range map[string]string{
		"not json":      `nope`,
		"no name":       `{"name":" ","routeIds":["1"]}`,
		"long name":     `{"name":"` + strings.Repeat("x", 41) + `","routeIds":["1"]}`,
		"no routes":     `{"name":"x","routeIds":[]}`,
		"blank route":   `{"name":"x","routeIds":[" "]}`,
		"long route id": `{"name":"x","routeIds":["` + strings.Repeat("9", 33) + `"]}`,
		"oversized":     `{"name":"x","routeIds":["` + strings.Repeat("1", 9000) + `"]}`,
	} {
		if rec := call(h, "POST", "/api/me/collections", alice, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, rec.Code)
		}
	}
}

func TestCollectionLimitIsReportedAsConflict(t *testing.T) {
	h := testServer(t)
	for i := 0; i < store.MaxCollectionsPerUser; i++ {
		if rec := call(h, "POST", "/api/me/collections", alice, toWork); rec.Code != http.StatusCreated {
			t.Fatalf("collection %d: status %d", i, rec.Code)
		}
	}
	if rec := call(h, "POST", "/api/me/collections", alice, toWork); rec.Code != http.StatusConflict {
		t.Errorf("over the limit: status %d, want 409", rec.Code)
	}
}

func TestDeleteMeAlsoErasesCollections(t *testing.T) {
	h := testServer(t)
	call(h, "POST", "/api/me/collections", alice, toWork)
	call(h, "DELETE", "/api/me", alice, "")
	if got := decodeCollections(t, call(h, "GET", "/api/me/collections", alice, "")); len(got) != 0 {
		t.Errorf("collections survived account deletion: %+v", got)
	}
}
