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
	"regexp"
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
	if err := c.waitTurn(ctx); err != nil {
		return nil, err
	}

	// If the query finds nothing, retry in friendlier forms: abbreviations spelled out,
	// then without the house number (the street is better than no answer).
	var results []Result
	for i, variant := range queryVariants(query) {
		if i > 0 {
			if err := c.waitTurn(ctx); err != nil {
				return nil, err
			}
		}
		c.last = time.Now()
		found, err := c.fetch(ctx, variant)
		if err != nil {
			return nil, err
		}
		if len(found) > 0 {
			results = found
			break
		}
	}
	if results == nil {
		results = []Result{}
	}
	if len(c.cache) >= cacheLimit {
		c.cache = map[string]cacheEntry{} // crude but bounded; the cache is only an optimisation
	}
	c.cache[key] = cacheEntry{results: results, expires: time.Now().Add(cacheTTL)}
	return results, nil
}

// waitTurn sleeps until the next upstream request is allowed. The caller holds c.mu.
func (c *Client) waitTurn(ctx context.Context) error {
	wait := c.minInterval - time.Since(c.last)
	if wait <= 0 {
		return nil
	}
	select {
	case <-time.After(wait):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Romanian street-type abbreviations people type, and what OpenStreetMap spells out.
var abbreviations = map[string]string{
	"sos": "Șoseaua", "str": "Strada", "bd": "Bulevardul", "bul": "Bulevardul",
	"b-dul": "Bulevardul", "al": "Aleea", "cal": "Calea", "pta": "Piața", "prov": "Provincial",
}

var trailingNumber = regexp.MustCompile(`\s+\d[\w/.-]*$`)

// queryVariants lists the queries to try, most literal first: as typed, with abbreviations
// expanded, then each of those without a trailing house number.
func queryVariants(q string) []string {
	words := strings.Fields(q)
	for i, w := range words {
		if full, ok := abbreviations[strings.ToLower(strings.TrimRight(w, "."))]; ok {
			words[i] = full
		}
	}
	expanded := strings.Join(words, " ")

	var out []string
	add := func(v string) {
		v = strings.TrimSpace(v)
		for _, have := range out {
			if strings.EqualFold(have, v) {
				return
			}
		}
		if v != "" {
			out = append(out, v)
		}
	}
	add(q)
	add(expanded)
	add(trailingNumber.ReplaceAllString(q, ""))
	add(trailingNumber.ReplaceAllString(expanded, ""))
	return out
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

	// Someone typing a number wants an address; otherwise a place's own name is the best title.
	preferAddress := strings.ContainsAny(query, "0123456789")

	out := make([]Result, 0, len(places))
	seen := map[string]bool{}
	for _, p := range places {
		lat, errLat := strconv.ParseFloat(p.Lat, 64)
		lng, errLng := strconv.ParseFloat(p.Lon, 64)
		if errLat != nil || errLng != nil {
			continue
		}
		label, detail := describe(p, preferAddress)

		// A building and the shop inside it are the same spot to a traveller.
		key := fmt.Sprintf("%s|%.4f|%.4f", label, lat, lng)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, Result{Label: label, Detail: detail, Lat: lat, Lng: lng})
	}
	return out, nil
}

// describe builds a short title and a secondary line from a Nominatim place. The
// title is the street and house number when preferAddress is set and they are known,
// otherwise the place's own name, otherwise whatever address parts exist.
func describe(p nominatimPlace, preferAddress bool) (label, detail string) {
	parts := strings.Split(p.DisplayName, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}

	road, house := p.Address["road"], p.Address["house_number"]
	switch {
	case preferAddress && road != "" && house != "":
		label = road + " " + house
	case p.Name != "":
		label = p.Name
	case road != "":
		label = road
		if house != "" {
			label += " " + house
		}
	case len(parts) > 0:
		label = parts[0]
	}

	// The rest of the display name, minus the title and noise like postcodes. A place's
	// name that lost the title to its address stays as the first detail.
	var rest []string
	if p.Name != "" && p.Name != label {
		rest = append(rest, p.Name)
	}
	for _, part := range parts {
		if len(rest) == 3 {
			break
		}
		if part == "" || part == p.Name || strings.Contains(label, part) || isPostcode(part) {
			continue // already in the title, or noise
		}
		rest = append(rest, part)
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
