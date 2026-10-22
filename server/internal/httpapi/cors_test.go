package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

var okHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusTeapot) // proves the request reached the handler
})

func do(h http.Handler, method, origin string, preflight bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/api/me/places", nil)
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	if preflight {
		r.Header.Set("Access-Control-Request-Method", "POST")
		r.Header.Set("Access-Control-Request-Headers", "authorization")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func TestCORSDisabledWhenNoOriginsConfigured(t *testing.T) {
	rec := do(cors("", okHandler), http.MethodGet, "https://site.example", false)
	if rec.Code != http.StatusTeapot || rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("status=%d allow-origin=%q, want a plain pass-through", rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestCORSAllowsListedOriginsOnly(t *testing.T) {
	h := cors("https://site.example, https://other.example/", okHandler)

	rec := do(h, http.MethodGet, "https://other.example", false)
	if rec.Header().Get("Access-Control-Allow-Origin") != "https://other.example" {
		t.Errorf("allow-origin = %q, want the caller's origin echoed (trailing slash in config ignored)", rec.Header().Get("Access-Control-Allow-Origin"))
	}
	if rec.Header().Get("Vary") != "Origin" {
		t.Error("responses that depend on Origin must say Vary: Origin")
	}

	rec = do(h, http.MethodGet, "https://evil.example", false)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" || rec.Code != http.StatusTeapot {
		t.Errorf("unlisted origin: allow-origin=%q status=%d", rec.Header().Get("Access-Control-Allow-Origin"), rec.Code)
	}

	if rec := do(h, http.MethodGet, "", false); rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("same-origin requests (no Origin header) should get no CORS headers")
	}
}

func TestCORSAnswersPreflightWithoutReachingHandlers(t *testing.T) {
	h := cors("https://site.example", okHandler)

	rec := do(h, http.MethodOptions, "https://site.example", true)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want 204", rec.Code)
	}
	for header, want := range map[string]string{
		"Access-Control-Allow-Origin":  "https://site.example",
		"Access-Control-Allow-Headers": "Authorization, Content-Type",
	} {
		if got := rec.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}
	if m := rec.Header().Get("Access-Control-Allow-Methods"); m == "" {
		t.Error("preflight must list the allowed methods")
	}

	// A disallowed origin's preflight gets no permission headers.
	if rec := do(h, http.MethodOptions, "https://evil.example", true); rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("preflight from an unlisted origin was granted")
	}
}

func TestCORSWildcard(t *testing.T) {
	rec := do(cors("*", okHandler), http.MethodGet, "https://anything.example", false)
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("allow-origin = %q, want *", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}
