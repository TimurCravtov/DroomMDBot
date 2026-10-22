package walking

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"droommd/server/internal/geo"
)

const okBody = `{"code":"Ok","routes":[{"distance":1868.7,"duration":1494.9,
  "geometry":{"type":"LineString","coordinates":[[28.8245,47.0189],[28.83,47.018],[28.8421,47.0136]]}}]}`

var (
	a = geo.Point{Lat: 47.0189, Lng: 28.8245}
	b = geo.Point{Lat: 47.0136, Lng: 28.8421}
)

func server(t *testing.T, hits *atomic.Int32, body string, status int) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.Header.Get("User-Agent") != "test-agent" {
			t.Errorf("User-Agent = %q", r.Header.Get("User-Agent"))
		}
		// OSRM wants longitude first.
		if !strings.Contains(r.URL.Path, "28.824500,47.018900;28.842100,47.013600") {
			t.Errorf("path = %s, want lng,lat pairs", r.URL.Path)
		}
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return New(srv.URL, "test-agent")
}

func TestRouteParsesGeometryAndDistance(t *testing.T) {
	var hits atomic.Int32
	c := server(t, &hits, okBody, http.StatusOK)

	got, err := c.Route(context.Background(), a, b)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Path) != 3 || got.DistanceM != 1868.7 {
		t.Errorf("route = %+v, want 3 points and 1868.7 m", got)
	}
	if got.Path[0] != [2]float64{28.8245, 47.0189} {
		t.Errorf("first point = %v, want [lng lat]", got.Path[0])
	}
}

func TestRouteIsCached(t *testing.T) {
	var hits atomic.Int32
	c := server(t, &hits, okBody, http.StatusOK)

	c.Route(context.Background(), a, b)
	// A hair's breadth away still counts as the same request.
	c.Route(context.Background(), geo.Point{Lat: 47.0189000001, Lng: 28.8245}, b)
	if hits.Load() != 1 {
		t.Errorf("upstream hit %d times, want 1", hits.Load())
	}
}

func TestRouteReportsFailures(t *testing.T) {
	for name, tc := range map[string]struct {
		body   string
		status int
	}{
		"server error": {`oops`, http.StatusBadGateway},
		"no route":     {`{"code":"NoRoute","routes":[]}`, http.StatusOK},
		"not json":     {`<html>`, http.StatusOK},
	} {
		t.Run(name, func(t *testing.T) {
			var hits atomic.Int32
			c := server(t, &hits, tc.body, tc.status)
			if _, err := c.Route(context.Background(), a, b); err == nil {
				t.Error("expected an error")
			}
		})
	}
}

func TestRouteHonoursCancellationWhileWaitingForASlot(t *testing.T) {
	var hits atomic.Int32
	c := server(t, &hits, okBody, http.StatusOK)
	for i := 0; i < maxInFlight; i++ {
		c.slots <- struct{}{} // all slots taken
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := c.Route(ctx, a, b); err == nil {
		t.Error("expected the queued request to give up when its context expired")
	}
	if hits.Load() != 0 {
		t.Error("a request without a slot must not reach the service")
	}
}
