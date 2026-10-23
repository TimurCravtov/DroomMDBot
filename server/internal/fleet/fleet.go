// Package fleet keeps the latest vehicle positions in memory by polling the
// upstream feed, and notifies subscribers after every refresh. Serving clients
// from memory means upstream load does not grow with the number of viewers.
package fleet

import (
	"context"
	"log"
	"math"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"droommd/server/internal/config"
	"droommd/server/internal/geo"
	"droommd/server/internal/transit"
	"droommd/server/internal/tranzy"
)

// minMoveM is how far a vehicle must travel before its heading is recomputed;
// GPS jitter while standing still would otherwise spin the arrow.
const minMoveM = 8

type Fleet struct {
	mu       sync.RWMutex
	snapshot []transit.LiveVehicle
	updated  time.Time

	// Only touched from the single poller goroutine.
	last     map[string]geo.Point // vehicle id -> last position used for heading
	headings map[string]float64   // vehicle id -> last known heading

	subsMu sync.Mutex
	subs   map[chan struct{}]struct{}
}

func New() *Fleet {
	return &Fleet{
		last:     map[string]geo.Point{},
		headings: map[string]float64{},
		subs:     map[chan struct{}]struct{}{},
	}
}

// Run polls until ctx is cancelled.
func (f *Fleet) Run(ctx context.Context, up *tranzy.Client, ds *atomic.Pointer[transit.Dataset], cfg config.Config) {
	tick := time.NewTicker(cfg.VehiclePoll)
	defer tick.Stop()
	for {
		f.refresh(ctx, up, ds.Load(), cfg.MaxVehicleAge)
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func (f *Fleet) refresh(ctx context.Context, up *tranzy.Client, ds *transit.Dataset, maxAge time.Duration) {
	reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	var raw []tranzy.Vehicle
	if err := up.Get(reqCtx, "vehicles", &raw); err != nil {
		log.Printf("vehicles: %v (keeping previous snapshot)", err)
		return
	}

	now := time.Now()
	live := make([]transit.LiveVehicle, 0, len(raw))
	for _, v := range raw {
		if v.RouteID == nil {
			continue
		}
		routeID := strconv.Itoa(*v.RouteID)
		if ds.RoutesByID[routeID] == nil {
			continue
		}
		ts, err := time.Parse(time.RFC3339Nano, v.Timestamp)
		if err != nil || now.Sub(ts) > maxAge || ts.After(now.Add(time.Minute)) {
			continue // stale (parked, tracker offline) or nonsense timestamp
		}

		id := strconv.Itoa(v.ID)
		speed := 0
		if v.Speed != nil {
			speed = int(math.Round(*v.Speed))
		}
		lv := transit.LiveVehicle{Vehicle: transit.Vehicle{
			ID: id, Label: v.Label, RouteID: routeID, Lat: v.Lat, Lng: v.Lon,
			Heading:  f.headingFor(id, geo.Point{Lat: v.Lat, Lng: v.Lon}),
			SpeedKmh: speed, UpdatedAt: ts.UnixMilli(),
		}}
		if v.TripID != nil {
			lv.TripID = *v.TripID
		}
		_, headingKnown := f.headings[id]
		o := ds.DirectionOf(lv, headingKnown)
		lv.Direction, lv.Toward = o.Direction, o.Toward
		switch {
		case o.OnRoute:
			lv.Heading, lv.HasHeading = o.Bearing, true
		case headingKnown:
			lv.HasHeading = true // keeps the heading derived from its movement
		}
		live = append(live, lv)
	}

	f.mu.Lock()
	f.snapshot = live
	f.updated = now
	f.mu.Unlock()
	f.broadcast()
}

// headingFor derives the direction of travel from consecutive positions, since the
// feed carries none.
func (f *Fleet) headingFor(id string, pos geo.Point) float64 {
	prev, seen := f.last[id]
	if !seen {
		f.last[id] = pos
		return 0
	}
	if geo.Haversine(prev, pos) >= minMoveM {
		f.headings[id] = geo.Bearing(prev, pos)
		f.last[id] = pos
	}
	return f.headings[id]
}

// Vehicles returns the current vehicles, limited to the given route ids (all if empty).
func (f *Fleet) Vehicles(routeIDs map[string]bool) []transit.Vehicle {
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := make([]transit.Vehicle, 0, len(f.snapshot))
	for _, v := range f.snapshot {
		if len(routeIDs) == 0 || routeIDs[v.RouteID] {
			out = append(out, v.Vehicle)
		}
	}
	return out
}

// Live returns the full current snapshot and when it was taken. Callers must not modify it.
func (f *Fleet) Live() ([]transit.LiveVehicle, time.Time) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.snapshot, f.updated
}

// Subscribe returns a channel that receives a signal after every refresh, and a
// function that ends the subscription.
func (f *Fleet) Subscribe() (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	f.subsMu.Lock()
	f.subs[ch] = struct{}{}
	f.subsMu.Unlock()
	return ch, func() {
		f.subsMu.Lock()
		delete(f.subs, ch)
		f.subsMu.Unlock()
	}
}

func (f *Fleet) broadcast() {
	f.subsMu.Lock()
	defer f.subsMu.Unlock()
	for ch := range f.subs {
		select {
		case ch <- struct{}{}:
		default: // subscriber is behind; it will pick up the latest snapshot anyway
		}
	}
}
