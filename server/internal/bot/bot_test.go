package bot

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const (
	testToken = "123456:SECRET-token"
	appURL    = "https://app.example.com"
)

// fakeTelegram records the Bot API calls it receives and serves queued updates.
type fakeTelegram struct {
	t       *testing.T
	mu      sync.Mutex
	calls   []call
	updates [][]update // each getUpdates call returns the next batch, then empty ones
}

type call struct {
	method string
	body   map[string]any
}

func newFake(t *testing.T, batches ...[]update) (*fakeTelegram, *Bot) {
	t.Helper()
	f := &fakeTelegram{t: t, updates: batches}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)

	b := New(testToken, appURL)
	b.apiBase = srv.URL
	return f, b
}

func (f *fakeTelegram) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	prefix := "/bot" + testToken + "/"
	if !strings.HasPrefix(r.URL.Path, prefix) {
		f.t.Errorf("request path %q does not carry the bot token", r.URL.Path)
		http.NotFound(w, r)
		return
	}
	method := strings.TrimPrefix(r.URL.Path, prefix)
	var body map[string]any
	raw, _ := io.ReadAll(r.Body)
	json.Unmarshal(raw, &body)

	f.mu.Lock()
	f.calls = append(f.calls, call{method, body})
	var result any = true
	if method == "getUpdates" {
		batch := []update{}
		if len(f.updates) > 0 {
			batch, f.updates = f.updates[0], f.updates[1:]
		}
		result = batch
	}
	f.mu.Unlock()

	if method == "getUpdates" && result.([]update) != nil && len(result.([]update)) == 0 {
		time.Sleep(20 * time.Millisecond) // behave like a (short) long poll
	}
	json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": result})
}

func (f *fakeTelegram) called(method string) []call {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []call
	for _, c := range f.calls {
		if c.method == method {
			out = append(out, c)
		}
	}
	return out
}

func msg(id int64, chatType, text string) update {
	var u update
	u.UpdateID = id
	u.Message = &message{Text: text}
	u.Message.Chat.ID = 4242
	u.Message.Chat.Type = chatType
	return u
}

func TestStartSendsAButtonThatOpensTheApp(t *testing.T) {
	f, b := newFake(t)

	if err := b.handle(context.Background(), msg(1, "private", "/start")); err != nil {
		t.Fatal(err)
	}

	sent := f.called("sendMessage")
	if len(sent) != 1 {
		t.Fatalf("sendMessage called %d times, want 1", len(sent))
	}
	body := sent[0].body
	if body["chat_id"].(float64) != 4242 {
		t.Errorf("chat_id = %v, want the chat the message came from", body["chat_id"])
	}
	if !strings.Contains(body["text"].(string), "Droom :: Routers") {
		t.Errorf("text = %q", body["text"])
	}

	// The button is a Mini App button (not a plain link), with the exact label.
	keyboard := body["reply_markup"].(map[string]any)["inline_keyboard"].([]any)
	button := keyboard[0].([]any)[0].(map[string]any)
	if button["text"] != "Droom :: Routers 📌" {
		t.Errorf("button text = %q", button["text"])
	}
	if url := button["web_app"].(map[string]any)["url"]; url != appURL {
		t.Errorf("web_app url = %v, want %s", url, appURL)
	}
	if _, plainLink := button["url"]; plainLink {
		t.Error("the button should launch a Mini App (web_app), not open a link")
	}
}

func TestCommandParsing(t *testing.T) {
	for text, want := range map[string]string{
		"/start":              "start",
		"/START":              "start",
		"/start@DroomBot":     "start",
		"/start some payload": "start",
		"/help@DroomBot x y":  "help",
		"hello":               "",
		"start":               "",
		"":                    "",
		"/":                   "",
		"text /start":         "",
	} {
		if got := command(text); got != want {
			t.Errorf("command(%q) = %q, want %q", text, got, want)
		}
	}
}

func TestOnlyPrivateChatCommandsAreAnswered(t *testing.T) {
	f, b := newFake(t)
	ctx := context.Background()

	for name, u := range map[string]update{
		"group chat":         msg(1, "group", "/start"),
		"supergroup":         msg(2, "supergroup", "/start"),
		"channel":            msg(3, "channel", "/start"),
		"plain text":         msg(4, "private", "hello there"),
		"unknown command":    msg(5, "private", "/dance"),
		"update with no msg": {UpdateID: 6},
	} {
		if err := b.handle(ctx, u); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	if n := len(f.called("sendMessage")); n != 0 {
		t.Errorf("sent %d messages for things that need no reply", n)
	}

	for _, command := range []string{"/start", "/help", "/app", "/start@DroomBot"} {
		b.handle(ctx, msg(7, "private", command))
	}
	if n := len(f.called("sendMessage")); n != 4 {
		t.Errorf("sent %d messages for the four supported commands, want 4", n)
	}
}

func TestSetupRegistersCommandsAndMenuButton(t *testing.T) {
	f, b := newFake(t)
	if err := b.Setup(context.Background()); err != nil {
		t.Fatal(err)
	}

	commands := f.called("setMyCommands")
	if len(commands) != 1 || !strings.Contains(string(mustJSON(commands[0].body)), `"start"`) {
		t.Errorf("setMyCommands = %+v", commands)
	}
	menu := f.called("setChatMenuButton")
	if len(menu) != 1 {
		t.Fatalf("setChatMenuButton called %d times", len(menu))
	}
	button := menu[0].body["menu_button"].(map[string]any)
	if button["type"] != "web_app" || button["web_app"].(map[string]any)["url"] != appURL {
		t.Errorf("menu button = %+v, want a web_app button for %s", button, appURL)
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func TestRunPollsAnswersAndAcknowledgesUpdates(t *testing.T) {
	f, b := newFake(t,
		[]update{msg(10, "private", "/start"), msg(11, "private", "noise")},
		[]update{msg(12, "private", "/start")},
	)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { b.Run(ctx); close(done) }()

	// Wait until both /start messages were answered.
	deadline := time.Now().Add(3 * time.Second)
	for len(f.called("sendMessage")) < 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("Run did not stop after its context was cancelled")
	}

	if n := len(f.called("sendMessage")); n != 2 {
		t.Errorf("answered %d messages, want 2", n)
	}
	if len(f.called("setChatMenuButton")) == 0 || len(f.called("deleteWebhook")) == 0 {
		t.Error("Run should set up the menu button and clear any webhook first")
	}

	// After the first batch the offset moves past the last update id (11 -> 12).
	var offsets []float64
	for _, c := range f.called("getUpdates") {
		offsets = append(offsets, c.body["offset"].(float64))
	}
	if len(offsets) < 2 || offsets[0] != 0 || offsets[1] != 12 {
		t.Errorf("getUpdates offsets = %v, want 0 then 12 (updates acknowledged)", offsets)
	}
}

func TestErrorsNeverContainTheToken(t *testing.T) {
	// A server that is not there: the HTTP client's error message includes the full URL.
	b := New(testToken, appURL)
	b.apiBase = "http://127.0.0.1:1"
	b.http = &http.Client{Timeout: time.Second}

	err := b.handle(context.Background(), msg(1, "private", "/start"))
	if err == nil {
		t.Fatal("expected an error")
	}
	if strings.Contains(err.Error(), testToken) || strings.Contains(err.Error(), "SECRET") {
		t.Errorf("error leaks the bot token: %v", err)
	}
}

func TestAPIErrorsAreReportedWithTelegramsDescription(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"ok": false, "error_code": 403, "description": "Forbidden: bot was blocked by the user"})
	}))
	defer srv.Close()
	b := New(testToken, appURL)
	b.apiBase = srv.URL

	err := b.handle(context.Background(), msg(1, "private", "/start"))
	if err == nil || !strings.Contains(err.Error(), "403") || !strings.Contains(err.Error(), "blocked") {
		t.Errorf("err = %v, want Telegram's code and description", err)
	}
}
