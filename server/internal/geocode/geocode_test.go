package geocode

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

const sampleResponse = `[
  {"display_name":"Universitatea de Stat, 60, Strada Alexei Mateevici, Buiucani, Chișinău, MD-2009, Moldova",
   "name":"Universitatea de Stat","lat":"47.0188945","lon":"28.8244644",
   "address":{"road":"Strada Alexei Mateevici","house_number":"60"}},
  {"display_name":"12, Strada Pușkin, Centru, Chișinău, 2012, Moldova",
   "name":"","lat":"47.0235","lon":"28.836",
   "address":{"road":"Strada Pușkin","house_number":"12"}},
  {"display_name":"broken","name":"x","lat":"not-a-number","lon":"28.8","address":{}}
]`

func testClient(t *testing.T, hits *atomic.Int32) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.Header.Get("User-Agent") != "test-agent" {
			t.Errorf("User-Agent = %q, want test-agent", r.Header.Get("User-Agent"))
		}
		if r.URL.Query().Get("q") == "" || r.URL.Query().Get("countrycodes") != "md" {
			t.Errorf("unexpected query: %s", r.URL.RawQuery)
		}
		w.Write([]byte(sampleResponse))
	}))
	t.Cleanup(srv.Close)
	c := New(srv.URL, "test-agent")
	c.minInterval = time.Millisecond
	return c
}

func TestSearchParsesPlacesAndSkipsBrokenOnes(t *testing.T) {
	var hits atomic.Int32
	c := testClient(t, &hits)

	got, err := c.Search(context.Background(), "mateevici 60")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d results, want 2 (the unparsable one is dropped): %+v", len(got), got)
	}
	if got[0].Label != "Universitatea de Stat" || got[0].Lat != 47.0188945 {
		t.Errorf("first result = %+v", got[0])
	}
	// Unnamed places are titled by street and number; postcodes stay out of the detail.
	if got[1].Label != "Strada Pușkin 12" {
		t.Errorf("second label = %q, want street and house number", got[1].Label)
	}
	if got[1].Detail != "Centru, Chișinău, Moldova" {
		t.Errorf("second detail = %q, want the area without repeating the title", got[1].Detail)
	}
}

func TestSearchCachesAndNormalizesQueries(t *testing.T) {
	var hits atomic.Int32
	c := testClient(t, &hits)
	ctx := context.Background()

	c.Search(ctx, "Mateevici  60")
	c.Search(ctx, "mateevici 60") // same query modulo case and spacing
	if hits.Load() != 1 {
		t.Errorf("upstream hit %d times, want 1 (second call served from cache)", hits.Load())
	}
}

func TestSearchIgnoresTooShortQueries(t *testing.T) {
	var hits atomic.Int32
	c := testClient(t, &hits)
	got, err := c.Search(context.Background(), " a ")
	if err != nil || len(got) != 0 || hits.Load() != 0 {
		t.Errorf("short query: results=%v err=%v hits=%d, want nothing and no upstream call", got, err, hits.Load())
	}
}

func TestSearchSpacesOutUpstreamCalls(t *testing.T) {
	var hits atomic.Int32
	c := testClient(t, &hits)
	c.minInterval = 60 * time.Millisecond

	start := time.Now()
	c.Search(context.Background(), "one")
	c.Search(context.Background(), "two")
	if elapsed := time.Since(start); elapsed < 55*time.Millisecond {
		t.Errorf("two different queries took %s, want them spaced by the minimum interval", elapsed)
	}
}

func TestSearchHonoursCancellationWhileQueued(t *testing.T) {
	var hits atomic.Int32
	c := testClient(t, &hits)
	c.minInterval = time.Hour
	c.Search(context.Background(), "first") // consumes the free slot

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := c.Search(ctx, "second"); err == nil {
		t.Error("expected the queued search to fail once its context expired")
	}
}
