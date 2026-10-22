// Package geocode looks up places and addresses through a Nominatim-compatible
// service (OpenStreetMap's public instance by default).
//
// The public instance has a usage policy: at most one request per second, an
// identifying User-Agent, and caching. The client therefore serializes requests,
// spaces them out and remembers results, so many viewers cost few upstream calls.
package geocode

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Result is one place; it mirrors GeocodeResult in client/src/api/types.ts.
type Result struct {
	Label  string  `json:"label"`
	Detail string  `json:"detail,omitempty"`
	Lat    float64 `json:"lat"`
	Lng    float64 `json:"lng"`
}

const (
	maxQueryLen = 120
	maxResults  = 6
	cacheTTL    = 24 * time.Hour
	cacheLimit  = 2000
	// Bias results toward Chișinău: left, top, right, bottom (lon, lat).
	viewbox = "28.70,47.10,28.98,46.92"
)

type cacheEntry struct {
	results []Result
	expires time.Time
}

type Client struct {
	baseURL   string
	userAgent string
	http      *http.Client
	// minInterval is the pause between upstream requests.
	minInterval time.Duration

	mu    sync.Mutex // guards last and cache, and serializes upstream calls
	last  time.Time
	cache map[string]cacheEntry
}

func New(baseURL, userAgent string) *Client {
	return &Client{
		baseURL:     strings.TrimRight(baseURL, "/"),
		userAgent:   userAgent,
		http:        &http.Client{Timeout: 10 * time.Second},
		minInterval: 1100 * time.Millisecond,
		cache:       map[string]cacheEntry{},
	}
}

// Search returns places matching free text, best first. Empty queries return nothing.
func (c *Client) Search(ctx context.Context, query string) ([]Result, error) {
	query = strings.Join(strings.Fields(query), " ")
	if len(query) < 2 {
		return []Result{}, nil
	}
	if len(query) > maxQueryLen {
		query = query[:maxQueryLen]
	}
	key := strings.ToLower(query)

	// Holding the lock across the upstream call is deliberate: it queues requests so
	// the rate limit holds, and concurrent identical queries then hit the cache.
	c.mu.Lock()
	defer c.mu.Unlock()

	if e, ok := c.cache[key]; ok && time.Now().Before(e.expires) {
		return e.results, nil
	}
	if wait := c.minInterval - time.Since(c.last); wait > 0 {
		select {
		case <-time.After(wait):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	c.last = time.Now()

	results, err := c.fetch(ctx, query)
	if err != nil {
		return nil, err
	}
	if len(c.cache) >= cacheLimit {
		c.cache = map[string]cacheEntry{} // crude but bounded; the cache is only an optimisation
	}
	c.cache[key] = cacheEntry{results: results, expires: time.Now().Add(cacheTTL)}
	return results, nil
}

type nominatimPlace struct {
	DisplayName string            `json:"display_name"`
	Name        string            `json:"name"`
	Lat         string            `json:"lat"`
	Lon         string            `json:"lon"`
	Address     map[string]string `json:"address"`
}

func (c *Client) fetch(ctx context.Context, query string) ([]Result, error) {
	params := url.Values{
		"q":               {query},
		"format":          {"jsonv2"},
		"limit":           {strconv.Itoa(maxResults)},
		"countrycodes":    {"md"},
		"viewbox":         {viewbox},
		"accept-language": {"ro,en"},
		"addressdetails":  {"1"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("geocoder: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return nil, fmt.Errorf("geocoder returned %s: %s", resp.Status, body)
	}

	var places []nominatimPlace
	if err := json.NewDecoder(resp.Body).Decode(&places); err != nil {
		return nil, fmt.Errorf("geocoder: decoding response: %w", err)
	}

	out := make([]Result, 0, len(places))
	for _, p := range places {
		lat, errLat := strconv.ParseFloat(p.Lat, 64)
		lng, errLng := strconv.ParseFloat(p.Lon, 64)
		if errLat != nil || errLng != nil {
			continue
		}
		label, detail := describe(p)
		out = append(out, Result{Label: label, Detail: detail, Lat: lat, Lng: lng})
	}
	return out, nil
}

// describe builds a short title and a secondary line from a Nominatim place:
// the place's own name, or else its street and house number.
func describe(p nominatimPlace) (label, detail string) {
	parts := strings.Split(p.DisplayName, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}

	switch {
	case p.Name != "":
		label = p.Name
	case p.Address["road"] != "":
		label = p.Address["road"]
		if n := p.Address["house_number"]; n != "" {
			label += " " + n
		}
	case len(parts) > 0:
		label = parts[0]
	}

	// The rest of the display name, minus the title and noise like postcodes.
	var rest []string
	for _, part := range parts {
		if part == "" || strings.Contains(label, part) || isPostcode(part) {
			continue // already in the title, or noise
		}
		rest = append(rest, part)
		if len(rest) == 3 {
			break
		}
	}
	return label, strings.Join(rest, ", ")
}

func isPostcode(s string) bool {
	if len(s) < 4 || len(s) > 7 {
		return false
	}
	for _, r := range s {
		if (r < '0' || r > '9') && r != '-' {
			return false
		}
	}
	return true
}
