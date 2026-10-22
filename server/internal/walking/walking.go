// Package walking finds walkable paths along streets and footpaths through an
// OSRM-compatible routing service (FOSSGIS's public pedestrian router by default).
//
// Like any public service it expects identified, modest use, so lookups are cached
// and only a few run at a time.
package walking

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"droommd/server/internal/geo"
)

// Route is a walkable path between two points.
type Route struct {
	Path      [][2]float64 // [lng, lat] pairs, following the streets
	DistanceM float64
}

const (
	requestTimeout = 3 * time.Second
	maxInFlight    = 3
	cacheTTL       = 6 * time.Hour
	cacheLimit     = 5000
)

type cacheKey struct{ fromLat, fromLng, toLat, toLng int }

type cacheEntry struct {
	route   Route
	expires time.Time
}

type Client struct {
	baseURL   string
	userAgent string
	http      *http.Client
	slots     chan struct{} // limits requests in flight

	mu    sync.Mutex
	cache map[cacheKey]cacheEntry
}

// New returns a client for an OSRM foot-routing service at baseURL, for example
// https://routing.openstreetmap.de/routed-foot.
func New(baseURL, userAgent string) *Client {
	return &Client{
		baseURL:   strings.TrimRight(baseURL, "/"),
		userAgent: userAgent,
		http:      &http.Client{Timeout: requestTimeout},
		slots:     make(chan struct{}, maxInFlight),
		cache:     map[cacheKey]cacheEntry{},
	}
}

// key rounds to about a meter, so near-identical requests share an entry.
func key(from, to geo.Point) cacheKey {
	r := func(v float64) int { return int(v*1e5 + 0.5) }
	return cacheKey{r(from.Lat), r(from.Lng), r(to.Lat), r(to.Lng)}
}

// Route returns the walking path from one point to another.
func (c *Client) Route(ctx context.Context, from, to geo.Point) (Route, error) {
	k := key(from, to)
	c.mu.Lock()
	if e, ok := c.cache[k]; ok && time.Now().Before(e.expires) {
		c.mu.Unlock()
		return e.route, nil
	}
	c.mu.Unlock()

	select {
	case c.slots <- struct{}{}:
		defer func() { <-c.slots }()
	case <-ctx.Done():
		return Route{}, ctx.Err()
	}

	route, err := c.fetch(ctx, from, to)
	if err != nil {
		return Route{}, err
	}

	c.mu.Lock()
	if len(c.cache) >= cacheLimit {
		c.cache = map[cacheKey]cacheEntry{} // bounded; the cache is only an optimisation
	}
	c.cache[k] = cacheEntry{route: route, expires: time.Now().Add(cacheTTL)}
	c.mu.Unlock()
	return route, nil
}

type osrmResponse struct {
	Code   string `json:"code"`
	Routes []struct {
		Distance float64 `json:"distance"`
		Geometry struct {
			Coordinates [][2]float64 `json:"coordinates"`
		} `json:"geometry"`
	} `json:"routes"`
}

func (c *Client) fetch(ctx context.Context, from, to geo.Point) (Route, error) {
	// The pedestrian server is addressed through the "driving" profile name.
	url := fmt.Sprintf("%s/route/v1/driving/%.6f,%.6f;%.6f,%.6f?overview=full&geometries=geojson&steps=false",
		c.baseURL, from.Lng, from.Lat, to.Lng, to.Lat)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Route{}, err
	}
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.http.Do(req)
	if err != nil {
		return Route{}, fmt.Errorf("walking router: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 200))
		return Route{}, fmt.Errorf("walking router returned %s: %s", resp.Status, body)
	}

	var out osrmResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return Route{}, fmt.Errorf("walking router: decoding response: %w", err)
	}
	if out.Code != "Ok" || len(out.Routes) == 0 || len(out.Routes[0].Geometry.Coordinates) < 2 {
		return Route{}, fmt.Errorf("walking router found no path (code %q)", out.Code)
	}
	r := out.Routes[0]
	return Route{Path: r.Geometry.Coordinates, DistanceM: r.Distance}, nil
}
