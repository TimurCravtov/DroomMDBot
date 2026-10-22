package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

const botToken = "123456:TEST-token"

// signedInitData builds launch data the way Telegram does, independently of the
// code under test (it follows the documented algorithm step by step).
func signedInitData(t *testing.T, token string, fields map[string]string) string {
	t.Helper()
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	lines := make([]string, len(keys))
	for i, k := range keys {
		lines[i] = k + "=" + fields[k]
	}

	key := hmac.New(sha256.New, []byte("WebAppData"))
	key.Write([]byte(token))
	sig := hmac.New(sha256.New, key.Sum(nil))
	sig.Write([]byte(strings.Join(lines, "\n")))

	q := url.Values{}
	for k, v := range fields {
		q.Set(k, v)
	}
	q.Set("hash", hex.EncodeToString(sig.Sum(nil)))
	return q.Encode()
}

func fields(authDate time.Time, userJSON string) map[string]string {
	return map[string]string{
		"auth_date": strconv.FormatInt(authDate.Unix(), 10),
		"query_id":  "AAH-example",
		"user":      userJSON,
	}
}

func TestVerifyInitDataAcceptsValidSignature(t *testing.T) {
	now := time.Now()
	data := signedInitData(t, botToken, fields(now.Add(-time.Minute), `{"id":777,"first_name":"Ana"}`))

	id, err := VerifyInitData(data, botToken, time.Hour, now)
	if err != nil || id != 777 {
		t.Fatalf("id=%d err=%v, want 777 and no error", id, err)
	}
}

func TestVerifyInitDataRejectsForgeries(t *testing.T) {
	now := time.Now()
	good := fields(now, `{"id":777}`)

	cases := map[string]string{
		"signed with another bot's token": signedInitData(t, "999:OTHER", good),
		"no hash":                         "auth_date=1&user=%7B%22id%22%3A1%7D",
		"garbage":                         "%%%",
		"empty":                           "",
	}
	// Changing any signed field after signing breaks the signature.
	tampered := signedInitData(t, botToken, good)
	tampered = strings.Replace(tampered, url.QueryEscape(`{"id":777}`), url.QueryEscape(`{"id":1}`), 1)
	cases["user id swapped after signing"] = tampered

	for name, data := range cases {
		if id, err := VerifyInitData(data, botToken, time.Hour, now); err == nil {
			t.Errorf("%s: accepted as user %d", name, id)
		}
	}
}

func TestVerifyInitDataChecksAge(t *testing.T) {
	now := time.Now()

	old := signedInitData(t, botToken, fields(now.Add(-25*time.Hour), `{"id":1}`))
	if _, err := VerifyInitData(old, botToken, 24*time.Hour, now); err == nil {
		t.Error("expired init data was accepted")
	}

	future := signedInitData(t, botToken, fields(now.Add(time.Hour), `{"id":1}`))
	if _, err := VerifyInitData(future, botToken, 24*time.Hour, now); err == nil {
		t.Error("init data dated in the future was accepted")
	}

	missing := fields(now, `{"id":1}`)
	delete(missing, "auth_date")
	if _, err := VerifyInitData(signedInitData(t, botToken, missing), botToken, time.Hour, now); err == nil {
		t.Error("init data without auth_date was accepted")
	}
}

func TestVerifyInitDataNeedsAUser(t *testing.T) {
	now := time.Now()
	for name, user := range map[string]string{"no user": "", "not json": "nope", "zero id": `{"id":0}`} {
		data := signedInitData(t, botToken, fields(now, user))
		if _, err := VerifyInitData(data, botToken, time.Hour, now); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func request(authorization string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/me/places", nil)
	if authorization != "" {
		r.Header.Set("Authorization", authorization)
	}
	return r
}

func TestAuthenticateTelegram(t *testing.T) {
	cfg := Config{BotToken: botToken, MaxAge: time.Hour}
	data := signedInitData(t, botToken, fields(time.Now(), `{"id":42}`))

	id, err := cfg.Authenticate(request("tma " + data))
	if err != nil || id != "tg:42" {
		t.Fatalf("id=%q err=%v, want tg:42", id, err)
	}
	if _, err := cfg.Authenticate(request("TMA " + data)); err != nil {
		t.Errorf("scheme should be case-insensitive: %v", err)
	}

	// Without a configured bot token Telegram callers cannot be verified, so none pass.
	if _, err := (Config{MaxAge: time.Hour}).Authenticate(request("tma " + data)); err == nil {
		t.Error("accepted Telegram data with no bot token configured")
	}
}

const goodAnon = "abcdefghijklmnopqrstuvwxyz012345" // 32 characters

func TestAnonymousAccessIsOptIn(t *testing.T) {
	off := Config{BotToken: botToken, MaxAge: time.Hour}
	if _, err := off.Authenticate(request("anon " + goodAnon)); err == nil {
		t.Error("anonymous token accepted although AllowAnon is off")
	}

	on := Config{BotToken: botToken, MaxAge: time.Hour, AllowAnon: true}
	id, err := on.Authenticate(request("anon " + goodAnon))
	if err != nil || !strings.HasPrefix(id, "anon:") {
		t.Fatalf("id=%q err=%v, want an anon: id", id, err)
	}
	again, _ := on.Authenticate(request("anon " + goodAnon))
	other, _ := on.Authenticate(request("anon " + goodAnon[:31] + "X"))
	if id != again || id == other {
		t.Error("the same token must map to the same user, different tokens to different users")
	}
	if strings.Contains(id, goodAnon) {
		t.Error("the stored id must not contain the secret token")
	}

	for name, token := range map[string]string{"too short": "short", "bad characters": strings.Repeat("!", 40)} {
		if _, err := on.Authenticate(request("anon " + token)); err == nil {
			t.Errorf("%s token accepted", name)
		}
	}
}

func TestAnonymousCannotBeATelegramUser(t *testing.T) {
	on := Config{BotToken: botToken, MaxAge: time.Hour, AllowAnon: true}
	id, _ := on.Authenticate(request("anon tg:42-padding-padding-padding-padding"))
	if strings.HasPrefix(id, "tg:") {
		t.Errorf("anonymous caller got a Telegram-namespaced id %q", id)
	}
}

func TestMiddleware(t *testing.T) {
	cfg := Config{BotToken: botToken, MaxAge: time.Hour, AllowAnon: true}
	var seen string
	handler := cfg.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, _ = UserID(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, request(""))
	if rec.Code != http.StatusUnauthorized || rec.Header().Get("WWW-Authenticate") == "" {
		t.Errorf("no credentials: status %d, want 401 with WWW-Authenticate", rec.Code)
	}

	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, request("anon "+goodAnon))
	if rec.Code != http.StatusNoContent || !strings.HasPrefix(seen, "anon:") {
		t.Errorf("valid credentials: status %d, user %q", rec.Code, seen)
	}
}
