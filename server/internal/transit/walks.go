package transit

import (
	"context"
	"math"
	"sort"
	"sync"

	"droommd/server/internal/geo"
)

// WalkRoute is a walkable path between two points, as a street router returns it.
type WalkRoute struct {
	Path      [][2]float64 // [lng, lat] pairs
	DistanceM float64
}

// WalkRouter finds a walkable path. Errors mean "no better answer than a straight line".
type WalkRouter func(ctx context.Context, from, to geo.Point) (WalkRoute, error)

func (p PlanPlace) point() geo.Point { return geo.Point{Lat: p.Lat, Lng: p.Lng} }

// RefineWalks replaces the straight lines of walking legs with paths along streets,
// updates their distances and times, and re-totals and re-ranks the itineraries. A leg
// the router can't route keeps its straight line. The input slice is modified.
func RefineWalks(ctx context.Context, its []Itinerary, route WalkRouter) []Itinerary {
	if route == nil || len(its) == 0 {
		return its
	}

	type pair struct{ from, to PlanPlace }
	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		results = map[pair]WalkRoute{}
		queued  = map[pair]bool{}
	)
	// The same walk often appears in several itineraries; route each once.
	for _, it := range its {
		for _, l := range it.Legs {
			p := pair{l.From, l.To}
			if l.Mode != "walk" || queued[p] {
				continue
			}
			queued[p] = true
			wg.Add(1)
			go func() {
				defer wg.Done()
				if r, err := route(ctx, p.from.point(), p.to.point()); err == nil && len(r.Path) >= 2 {
					mu.Lock()
					results[p] = r
					mu.Unlock()
				}
			}()
		}
	}
	wg.Wait()

	for i := range its {
		for j := range its[i].Legs {
			l := &its[i].Legs[j]
			r, ok := results[pair{l.From, l.To}]
			if l.Mode != "walk" || !ok {
				continue
			}

			// The router snaps both ends to the nearest street; join them to the real points.
			first, last := r.Path[0], r.Path[len(r.Path)-1]
			snapped := geo.Haversine(l.From.point(), geo.Point{Lat: first[1], Lng: first[0]}) +
				geo.Haversine(l.To.point(), geo.Point{Lat: last[1], Lng: last[0]})
			path := make([][2]float64, 0, len(r.Path)+2)
			path = append(path, [2]float64{l.From.Lng, l.From.Lat})
			path = append(path, r.Path...)
			path = append(path, [2]float64{l.To.Lng, l.To.Lat})

			meters := r.DistanceM + snapped
			l.Path = path
			l.DistanceM = int(math.Round(meters))
			l.DurationS = int(math.Round(meters / walkSpeedMS))
		}
		its[i].retotal()
	}
	sort.SliceStable(its, func(a, b int) bool { return its[a].DurationS < its[b].DurationS })
	return its
}

// retotal recomputes the itinerary's totals from its legs.
func (it *Itinerary) retotal() {
	it.DurationS, it.WalkM = 0, 0
	for _, l := range it.Legs {
		it.DurationS += l.DurationS + l.WaitS
		if l.Mode == "walk" {
			it.WalkM += l.DistanceM
		}
	}
}
