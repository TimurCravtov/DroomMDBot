// Package tranzy is a thin client for the Tranzy open data API (GTFS-like JSON).
package tranzy

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Wire formats of the upstream endpoints.

type Route struct {
	RouteID   int    `json:"route_id"`
	ShortName string `json:"route_short_name"`
	LongName  string `json:"route_long_name"`
	Color     string `json:"route_color"`
	RouteType int    `json:"route_type"`
}

type Stop struct {
	StopID int     `json:"stop_id"`
	Name   string  `json:"stop_name"`
	Lat    float64 `json:"stop_lat"`
	Lon    float64 `json:"stop_lon"`
}

type Trip struct {
	RouteID     int    `json:"route_id"`
	TripID      string `json:"trip_id"`
	DirectionID int    `json:"direction_id"`
	ShapeID     string `json:"shape_id"`
}

type StopTime struct {
	TripID   string `json:"trip_id"`
	StopID   int    `json:"stop_id"`
	Sequence int    `json:"stop_sequence"`
}

type ShapePoint struct {
	ShapeID  string  `json:"shape_id"`
	Lat      float64 `json:"shape_pt_lat"`
	Lon      float64 `json:"shape_pt_lon"`
	Sequence int     `json:"shape_pt_sequence"`
}

type Vehicle struct {
	ID        int      `json:"id"`
	Label     string   `json:"label"`
	Lat       float64  `json:"latitude"`
	Lon       float64  `json:"longitude"`
	Timestamp string   `json:"timestamp"`
	Speed     *float64 `json:"speed"`
	RouteID   *int     `json:"route_id"`
	TripID    *string  `json:"trip_id"`
}

type Client struct {
	http    *http.Client
	baseURL string
	apiKey  string
	agency  string
}

func New(baseURL, apiKey, agencyID string) *Client {
	return &Client{
		http:    &http.Client{Timeout: 60 * time.Second},
		baseURL: baseURL,
		apiKey:  apiKey,
		agency:  agencyID,
	}
}

// Get fetches one endpoint (e.g. "routes") and decodes the JSON array into out.
func (c *Client) Get(ctx context.Context, endpoint string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/"+endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-API-KEY", c.apiKey)
	req.Header.Set("X-Agency-Id", c.agency)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s: %w", endpoint, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("%s: upstream returned %s: %s", endpoint, resp.Status, body)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("%s: decoding response: %w", endpoint, err)
	}
	return nil
}
