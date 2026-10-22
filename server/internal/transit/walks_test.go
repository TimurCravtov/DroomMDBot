package transit

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"

	"droommd/server/internal/geo"
)

func walkLegBetween(from, to PlanPlace, straightM int) Leg {
	return Leg{
		Mode: "walk", From: from, To: to,
		DistanceM: straightM, DurationS: int(float64(straightM) / walkSpeedMS),
		Path: [][2]float64{{from.Lng, from.Lat}, {to.Lng, to.Lat}},
	}
}

func TestRefineWalksFollowsStreetsAndRetotals(t *testing.T) {
	start := PlanPlace{Lat: 47.000, Lng: 28.800}
	stop := PlanPlace{Name: "Stop", Lat: 47.001, Lng: 28.801}
	end := PlanPlace{Lat: 47.010, Lng: 28.810}

	walk := walkLegBetween(start, stop, 140)
	ride := Leg{Mode: "transit", From: stop, To: end, DistanceM: 1500, DurationS: 250, WaitS: 120,
		Path: [][2]float64{{stop.Lng, stop.Lat}, {end.Lng, end.Lat}}}
	its := []Itinerary{{Legs: []Leg{walk, ride}}}
	its[0].retotal()
	before := its[0].DurationS

	// The street route is longer than the straight line and detours via a corner.
	route := func(_ context.Context, a, b geo.Point) (WalkRoute, error) {
		return WalkRoute{
			Path:      [][2]float64{{28.8001, 47.0}, {28.8001, 47.001}, {28.8010, 47.001}},
			DistanceM: 300,
		}, nil
	}
	got := RefineWalks(context.Background(), its, route)

	leg := got[0].Legs[0]
	if len(leg.Path) != 5 {
		t.Fatalf("path has %d points, want the 3 street points plus both exact ends", len(leg.Path))
	}
	if leg.Path[0] != [2]float64{start.Lng, start.Lat} || leg.Path[4] != [2]float64{stop.Lng, stop.Lat} {
		t.Errorf("path should start and end at the real points: %v", leg.Path)
	}
	if leg.DistanceM < 300 || leg.DistanceM > 320 {
		t.Errorf("distance = %d, want about 300 m plus a few meters of snapping", leg.DistanceM)
	}
	wantSecs := int(float64(leg.DistanceM) / walkSpeedMS)
	if d := leg.DurationS - wantSecs; d < -1 || d > 1 {
		t.Errorf("duration = %d s, want the distance at walking pace (%d s)", leg.DurationS, wantSecs)
	}
	if got[0].DurationS <= before || got[0].WalkM != leg.DistanceM {
		t.Errorf("totals not refreshed: duration %d (was %d), walkM %d", got[0].DurationS, before, got[0].WalkM)
	}
	if got[0].Legs[1].Path[0] != ride.Path[0] {
		t.Error("transit legs must be left alone")
	}
}

func TestRefineWalksKeepsStraightLinesWhenRoutingFails(t *testing.T) {
	a := PlanPlace{Lat: 47, Lng: 28.8}
	b := PlanPlace{Lat: 47.001, Lng: 28.801}
	its := []Itinerary{{Legs: []Leg{walkLegBetween(a, b, 140)}}}
	its[0].retotal()

	got := RefineWalks(context.Background(), its, func(context.Context, geo.Point, geo.Point) (WalkRoute, error) {
		return WalkRoute{}, errors.New("router down")
	})
	if len(got[0].Legs[0].Path) != 2 || got[0].Legs[0].DistanceM != 140 {
		t.Errorf("leg changed despite the router failing: %+v", got[0].Legs[0])
	}
}

func TestRefineWalksRoutesEachPairOnceAndReranks(t *testing.T) {
	a := PlanPlace{Lat: 47, Lng: 28.8}
	b := PlanPlace{Lat: 47.001, Lng: 28.801}
	c := PlanPlace{Lat: 47.02, Lng: 28.82}
	shared := walkLegBetween(a, b, 140)
	// Itinerary 0 looks quicker on paper (a short straight walk plus a short ride), but
	// its real walk turns out long; itinerary 1 has no walking to refine.
	its := []Itinerary{
		{Legs: []Leg{shared, {Mode: "transit", From: b, To: c, DurationS: 100, WaitS: 60,
			Path: [][2]float64{{b.Lng, b.Lat}, {c.Lng, c.Lat}}}}},
		{Legs: []Leg{{Mode: "transit", From: a, To: c, DurationS: 500, WaitS: 100,
			Path: [][2]float64{{a.Lng, a.Lat}, {c.Lng, c.Lat}}}}},
		{Legs: []Leg{shared}}, // the same walk again
	}
	for i := range its {
		its[i].retotal()
	}

	var calls atomic.Int32
	got := RefineWalks(context.Background(), its, func(context.Context, geo.Point, geo.Point) (WalkRoute, error) {
		calls.Add(1)
		return WalkRoute{Path: [][2]float64{{28.8, 47}, {28.801, 47.001}}, DistanceM: 900}, nil
	})

	if calls.Load() != 1 {
		t.Errorf("router called %d times for the same walk, want 1", calls.Load())
	}
	for i := 1; i < len(got); i++ {
		if got[i-1].DurationS > got[i].DurationS {
			t.Errorf("itineraries not sorted by duration: %d then %d", got[i-1].DurationS, got[i].DurationS)
		}
	}
	if got[0].Legs[0].Mode != "transit" || len(got[0].Legs) != 1 {
		t.Errorf("the ride-only itinerary should now lead, got %+v", got[0])
	}
}

func TestRefineWalksWithoutARouterIsANoOp(t *testing.T) {
	its := []Itinerary{{DurationS: 5}}
	if got := RefineWalks(context.Background(), its, nil); got[0].DurationS != 5 {
		t.Error("nil router must leave itineraries untouched")
	}
}
