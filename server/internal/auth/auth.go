// Package auth works out who is calling the API.
//
// Two kinds of caller are recognized, each in the Authorization header:
//
//	tma <initData>   a Telegram Mini App; initData is Telegram's signed launch data, which
//	                 is verified with the bot token before the user id inside is believed.
//	anon <token>     a plain browser, for testing outside Telegram. The token is a random
//	                 secret the browser made up; it identifies the browser, nothing more.
//	                 Only accepted when explicitly enabled (AUTH_ALLOW_ANON).
//
// User ids are namespaced ("tg:123", "anon:…") so an anonymous caller can never act as a
// Telegram user.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// BotToken verifies Telegram's initData. Empty disables Telegram sign-in.
	BotToken string
	// MaxAge is how old initData may be. It is fixed when the Mini App opens, so
	// this bounds how long a session lasts before the app must be reopened.
	MaxAge time.Duration
	// AllowAnon enables anonymous browser tokens.
	AllowAnon bool
}

var (
	// ErrUnauthorized means no valid credentials were presented.
	ErrUnauthorized = errors.New("unauthorized")

	anonToken = regexp.MustCompile(`^[A-Za-z0-9_-]{32,128}$`)
)

type ctxKey struct{}

// UserID returns the authenticated user of a request, set by Middleware.
func UserID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(ctxKey{}).(string)
	return id, ok
}

// Authenticate returns the user id for a request.
func (c Config) Authenticate(r *http.Request) (string, error) {
	scheme, credential, ok := strings.Cut(strings.TrimSpace(r.Header.Get("Authorization")), " ")
	if !ok || credential == "" {
		return "", fmt.Errorf("%w: missing Authorization header", ErrUnauthorized)
	}

	switch strings.ToLower(scheme) {
	case "tma":
		if c.BotToken == "" {
			return "", fmt.Errorf("%w: Telegram sign-in is not configured", ErrUnauthorized)
		}
		id, err := VerifyInitData(credential, c.BotToken, c.MaxAge, time.Now())
		if err != nil {
			return "", fmt.Errorf("%w: %v", ErrUnauthorized, err)
		}
		return "tg:" + strconv.FormatInt(id, 10), nil

	case "anon":
		if !c.AllowAnon {
			return "", fmt.Errorf("%w: anonymous access is disabled", ErrUnauthorized)
		}
		if !anonToken.MatchString(credential) {
			return "", fmt.Errorf("%w: malformed anonymous token", ErrUnauthorized)
		}
		// Store only a hash: a copy of the database must not reveal working tokens.
		sum := sha256.Sum256([]byte(credential))
		return "anon:" + hex.EncodeToString(sum[:16]), nil
	}
	return "", fmt.Errorf("%w: unknown scheme %q", ErrUnauthorized, scheme)
}

// Middleware rejects unauthenticated requests and passes the user id on in the context.
func (c Config) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := c.Authenticate(r)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("WWW-Authenticate", "tma")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, id)))
	})
}

// VerifyInitData checks Telegram's signature over a Mini App's launch data and returns
// the Telegram user id inside it.
// See https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
func VerifyInitData(initData, botToken string, maxAge time.Duration, now time.Time) (int64, error) {
	values, err := url.ParseQuery(initData)
	if err != nil {
		return 0, errors.New("malformed init data")
	}
	hash := values.Get("hash")
	if hash == "" {
		return 0, errors.New("init data has no hash")
	}
	values.Del("hash")

	// The signed text is every other field as key=value, sorted by key, one per line.
	pairs := make([]string, 0, len(values))
	for key := range values {
		pairs = append(pairs, key+"="+values.Get(key))
	}
	sort.Strings(pairs)

	secret := hmac.New(sha256.New, []byte("WebAppData"))
	secret.Write([]byte(botToken))
	mac := hmac.New(sha256.New, secret.Sum(nil))
	mac.Write([]byte(strings.Join(pairs, "\n")))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(strings.ToLower(hash))) {
		return 0, errors.New("bad signature")
	}

	// The signature only proves Telegram issued this data at some point; check it is recent.
	authDate, err := strconv.ParseInt(values.Get("auth_date"), 10, 64)
	if err != nil {
		return 0, errors.New("init data has no valid auth_date")
	}
	age := now.Sub(time.Unix(authDate, 0))
	if age > maxAge {
		return 0, errors.New("init data has expired; reopen the app")
	}
	if age < -5*time.Minute {
		return 0, errors.New("init data is dated in the future")
	}

	var user struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal([]byte(values.Get("user")), &user); err != nil || user.ID == 0 {
		return 0, errors.New("init data has no user")
	}
	return user.ID, nil
}
