// Package bot is the Telegram side of the app: it answers /start with a button that opens
// the Mini App.
//
// It talks to the Bot API with plain HTTPS and receives messages by long polling
// (getUpdates), so it needs no public webhook and works the same on a laptop and on a
// server. Run only one instance per bot token: two pollers would fight over the updates.
package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// ButtonText is the label of the button that opens the app.
const ButtonText = "Droom :: Routers 📌"

const (
	welcomeText = "Droom :: Routers 📌\n\n" +
		"Live buses and trolleybuses in Chișinău: see where they are right now, " +
		"find a route, and save your home and work."
	pollTimeoutSeconds = 30
	maxBackoff         = 30 * time.Second
)

type Bot struct {
	token   string
	appURL  string
	apiBase string // https://api.telegram.org, overridable in tests
	http    *http.Client
}

// New returns a bot that opens appURL (the Mini App, which must be an https address).
func New(token, appURL string) *Bot {
	return &Bot{
		token:   token,
		appURL:  appURL,
		apiBase: "https://api.telegram.org",
		// Longer than the long-poll timeout, or every idle poll would look like an error.
		http: &http.Client{Timeout: (pollTimeoutSeconds + 15) * time.Second},
	}
}

// Subset of the Bot API types this bot reads.
type update struct {
	UpdateID int64    `json:"update_id"`
	Message  *message `json:"message"`
}

type message struct {
	Text string `json:"text"`
	Chat struct {
		ID   int64  `json:"id"`
		Type string `json:"type"`
	} `json:"chat"`
}

type apiResponse struct {
	OK          bool            `json:"ok"`
	Result      json.RawMessage `json:"result"`
	Description string          `json:"description"`
	ErrorCode   int             `json:"error_code"`
}

// call invokes a Bot API method and returns its result. Errors never contain the token,
// which is part of every request URL and would otherwise end up in logs.
func (b *Bot) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	body, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.apiBase+"/bot"+b.token+"/"+method, bytes.NewReader(body))
	if err != nil {
		return nil, b.redact(err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := b.http.Do(req)
	if err != nil {
		return nil, b.redact(err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, b.redact(err)
	}
	var out apiResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("telegram %s: unexpected response (HTTP %d)", method, resp.StatusCode)
	}
	if !out.OK {
		return nil, &apiError{method: method, code: out.ErrorCode, description: out.Description}
	}
	return out.Result, nil
}

type apiError struct {
	method      string
	code        int
	description string
}

func (e *apiError) Error() string {
	return fmt.Sprintf("telegram %s: %d %s", e.method, e.code, e.description)
}

// redact removes the token from an error from the HTTP client.
func (b *Bot) redact(err error) error {
	if err == nil || b.token == "" {
		return err
	}
	return errors.New(strings.ReplaceAll(err.Error(), b.token, "<token>"))
}

// Setup registers what shows up in Telegram's UI: the command list, and the bot's menu
// button, so the app is one tap away from any chat with the bot.
func (b *Bot) Setup(ctx context.Context) error {
	if _, err := b.call(ctx, "setMyCommands", map[string]any{
		"commands": []map[string]string{
			{"command": "start", "description": "Open Droom :: Routers"},
			{"command": "help", "description": "How to use the app"},
		},
	}); err != nil {
		return err
	}
	_, err := b.call(ctx, "setChatMenuButton", map[string]any{
		"menu_button": map[string]any{
			"type":    "web_app",
			"text":    "Routers",
			"web_app": map[string]string{"url": b.appURL},
		},
	})
	return err
}

// Run receives messages until ctx is cancelled. Failures are retried with backoff.
func (b *Bot) Run(ctx context.Context) {
	if err := b.Setup(ctx); err != nil {
		// Not fatal: the bot still answers /start without a menu button.
		log.Printf("bot: setting up commands and menu button: %v", err)
	}
	// A leftover webhook would make getUpdates fail with a conflict.
	if _, err := b.call(ctx, "deleteWebhook", map[string]any{}); err != nil && ctx.Err() == nil {
		log.Printf("bot: removing webhook: %v", err)
	}

	var offset int64
	backoff := time.Second
	for ctx.Err() == nil {
		updates, err := b.getUpdates(ctx, offset)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("bot: polling failed: %v (retrying in %s)", err, backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			backoff = min(backoff*2, maxBackoff)
			continue
		}
		backoff = time.Second

		for _, u := range updates {
			offset = u.UpdateID + 1 // acknowledge, even if handling fails: never loop on one update
			if err := b.handle(ctx, u); err != nil && ctx.Err() == nil {
				log.Printf("bot: handling update %d: %v", u.UpdateID, err)
			}
		}
	}
}

func (b *Bot) getUpdates(ctx context.Context, offset int64) ([]update, error) {
	raw, err := b.call(ctx, "getUpdates", map[string]any{
		"offset":          offset,
		"timeout":         pollTimeoutSeconds,
		"allowed_updates": []string{"message"},
	})
	if err != nil {
		return nil, err
	}
	var updates []update
	if err := json.Unmarshal(raw, &updates); err != nil {
		return nil, fmt.Errorf("decoding updates: %w", err)
	}
	return updates, nil
}

// command returns the command in a message ("start" for "/start", "/start@MyBot x"), or "".
func command(text string) string {
	if !strings.HasPrefix(text, "/") {
		return ""
	}
	first, _, _ := strings.Cut(text, " ")
	name, _, _ := strings.Cut(strings.TrimPrefix(first, "/"), "@")
	return strings.ToLower(name)
}

func (b *Bot) handle(ctx context.Context, u update) error {
	m := u.Message
	// Buttons that open a Mini App only work in private chats.
	if m == nil || m.Chat.Type != "private" {
		return nil
	}

	switch command(m.Text) {
	case "start", "app", "help":
		return b.sendWelcome(ctx, m.Chat.ID)
	}
	return nil
}

func (b *Bot) sendWelcome(ctx context.Context, chatID int64) error {
	_, err := b.call(ctx, "sendMessage", map[string]any{
		"chat_id": chatID,
		"text":    welcomeText,
		"reply_markup": map[string]any{
			"inline_keyboard": [][]map[string]any{{
				{"text": ButtonText, "web_app": map[string]string{"url": b.appURL}},
			}},
		},
	})
	return err
}
