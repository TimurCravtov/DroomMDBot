package transit

import (
	"context"
	"errors"
	"math"
	"sort"
	"strconv"
	"sync"

	"droommd/server/internal/geo"
	"droommd/server/internal/tranzy"
)

// trip is one direction of a route, with its stops placed along its shape.
type trip struct {
	id          string
	routeID     string
	line        *geo.Polyline
	stopOffsets map[string]float64 // stop id -> meters along the shape

	direction string // DirectionForward or DirectionBack
	toward    string // destination: the trip's headsign, else its last stop

	stops  []string  // stop ids in travel order
	dist   []float64 // meters travelled at each stop, non-decreasing
	shaped bool      // dist is measured along line, so line can draw the way between stops
}

// Dataset is the static part of the feed. It is built once, never mutated, and
// swapped wholesale on refresh, so readers need no locking.
type Dataset struct {
	Routes     []Route
	RoutesByID map[string]*Route
	Stops      []Stop
	StopsByID  map[string]*Stop
	// RouteShapes lists the drawable paths of each route, as [lng, lat] pairs.
	RouteShapes map[string][][][2]float64
	// RouteShapeInfo describes each path of RouteShapes, in the same order.
	RouteShapeInfo map[string][]PathInfo

	trips      map[string]*trip
	routeTrips map[string][]*trip
	// stopRefs lists every trip stopping at a stop, and where in its sequence.
	stopRefs map[string][]stopRef
	// grid buckets stop indices by map cell for nearby-stop lookups.
	grid map[cell][]int
	// stopRoutes lists the distinct route numbers calling at each stop.
	stopRoutes map[string][]string
}

// TripCount is the number of route directions in the feed.
func (d *Dataset) TripCount() int { return len(d.trips) }

func routeType(gtfsType int) string {
	switch gtfsType {
	case 11, 800: // trolleybus
		return "trolleybus"
	default:
		return "bus"
	}
}

// Load fetches the static feed and indexes it.
func Load(ctx context.Context, up *tranzy.Client) (*Dataset, error) {
	var (
		routes    []tranzy.Route
		stops     []tranzy.Stop
		trips     []tranzy.Trip
		stopTimes []tranzy.StopTime
		shapePts  []tranzy.ShapePoint
	)

	// The endpoints are independent; fetch them in parallel.
	var wg sync.WaitGroup
	errs := make(chan error, 5)
	fetch := func(endpoint string, out any) {
		defer wg.Done()
		if err := up.Get(ctx, endpoint, out); err != nil {
			errs <- err
		}
	}
	wg.Add(5)
	go fetch("routes", &routes)
	go fetch("stops", &stops)
	go fetch("trips", &trips)
	go fetch("stop_times", &stopTimes)
	go fetch("shapes", &shapePts)
	wg.Wait()
	close(errs)
	if err := <-errs; err != nil {
		return nil, err
	}

	ds := &Dataset{
		RoutesByID:     make(map[string]*Route, len(routes)),
		StopsByID:      make(map[string]*Stop, len(stops)),
		RouteShapes:    make(map[string][][][2]float64, len(routes)),
		RouteShapeInfo: make(map[string][]PathInfo, len(routes)),
		trips:          make(map[string]*trip, len(trips)),
		stopRoutes:     make(map[string][]string),
	}

	ds.Stops = make([]Stop, 0, len(stops))
	for _, s := range stops {
		ds.Stops = append(ds.Stops, Stop{ID: strconv.Itoa(s.StopID), Name: s.Name, Lat: s.Lat, Lng: s.Lon})
	}
	for i := range ds.Stops {
		ds.StopsByID[ds.Stops[i].ID] = &ds.Stops[i]
	}

	// Shapes: group points by shape id, ordered by sequence.
	sort.SliceStable(shapePts, func(i, j int) bool {
		if shapePts[i].ShapeID != shapePts[j].ShapeID {
			return shapePts[i].ShapeID < shapePts[j].ShapeID
		}
		return shapePts[i].Sequence < shapePts[j].Sequence
	})
	shapes := make(map[string][]geo.Point)
	for _, p := range shapePts {
		shapes[p.ShapeID] = append(shapes[p.ShapeID], geo.Point{Lat: p.Lat, Lng: p.Lon})
	}

	// Stop sequences per trip.
	sort.SliceStable(stopTimes, func(i, j int) bool {
		if stopTimes[i].TripID != stopTimes[j].TripID {
			return stopTimes[i].TripID < stopTimes[j].TripID
		}
		return stopTimes[i].Sequence < stopTimes[j].Sequence
	})
	tripStops := make(map[string][]string)
	for _, st := range stopTimes {
		tripStops[st.TripID] = append(tripStops[st.TripID], strconv.Itoa(st.StopID))
	}

	// Trips, in a stable order (direction, then id) per route.
	sort.SliceStable(trips, func(i, j int) bool {
		if trips[i].RouteID != trips[j].RouteID {
			return trips[i].RouteID < trips[j].RouteID
		}
		if trips[i].DirectionID != trips[j].DirectionID {
			return trips[i].DirectionID < trips[j].DirectionID
		}
		return trips[i].TripID < trips[j].TripID
	})
	routeTrips := make(map[string][]*trip)
	seenShape := make(map[string]map[string]bool) // route id -> shape ids already emitted
	for _, t := range trips {
		routeID := strconv.Itoa(t.RouteID)
		tr := &trip{id: t.TripID, routeID: routeID, direction: DirectionForward, toward: t.Headsign}
		if t.DirectionID != 0 {
			tr.direction = DirectionBack
		}
		tr.stops = knownStops(ds, tripStops[t.TripID])
		if tr.toward == "" && len(tr.stops) > 0 {
			tr.toward = ds.StopsByID[tr.stops[len(tr.stops)-1]].Name
		}
		if pts := shapes[t.ShapeID]; len(pts) >= 2 {
			tr.line = geo.NewPolyline(pts)
			tr.stopOffsets = placeStops(ds, tr.line, tripStops[t.TripID])

			if seenShape[routeID] == nil {
				seenShape[routeID] = map[string]bool{}
			}
			if !seenShape[routeID][t.ShapeID] {
				seenShape[routeID][t.ShapeID] = true
				path := make([][2]float64, len(pts))
				for i, p := range pts {
					path[i] = [2]float64{p.Lng, p.Lat}
				}
				ds.RouteShapes[routeID] = append(ds.RouteShapes[routeID], path)
				ds.RouteShapeInfo[routeID] = append(ds.RouteShapeInfo[routeID], PathInfo{Direction: tr.direction, Toward: tr.toward})
			}
		}
		tr.dist, tr.shaped = stopDistances(ds, tr.line, tr.stops)
		ds.trips[t.TripID] = tr
		routeTrips[routeID] = append(routeTrips[routeID], tr)
	}

	ds.routeTrips = routeTrips

	// Routes, with their stops in travel order (first direction, then new stops of the other).
	numbersAt := make(map[string]map[string]bool)
	ds.Routes = make([]Route, 0, len(routes))
	for _, r := range routes {
		id := strconv.Itoa(r.RouteID)
		route := Route{ID: id, Number: r.ShortName, Type: routeType(r.RouteType), Name: r.LongName, StopIDs: []string{}}
		seen := map[string]bool{}
		for _, tr := range routeTrips[id] {
			for _, stopID := range tripStops[tr.id] {
				if seen[stopID] || ds.StopsByID[stopID] == nil {
					continue
				}
				seen[stopID] = true
				route.StopIDs = append(route.StopIDs, stopID)
				if numbersAt[stopID] == nil {
					numbersAt[stopID] = map[string]bool{}
				}
				numbersAt[stopID][route.Number] = true
			}
		}
		ds.Routes = append(ds.Routes, route)
	}
	sort.SliceStable(ds.Routes, func(i, j int) bool { return routeLess(ds.Routes[i], ds.Routes[j]) })
	for i := range ds.Routes {
		ds.RoutesByID[ds.Routes[i].ID] = &ds.Routes[i]
	}
	for stopID, set := range numbersAt {
		numbers := make([]string, 0, len(set))
		for n := range set {
			numbers = append(numbers, n)
		}
		sort.Slice(numbers, func(i, j int) bool { return numberLess(numbers[i], numbers[j]) })
		ds.stopRoutes[stopID] = numbers
	}

	if len(ds.Routes) == 0 || len(ds.Stops) == 0 {
		return nil, errors.New("upstream returned no routes or stops")
	}
	ds.index()
	return ds, nil
}

// placeStops finds how far along the shape each stop of a trip lies. Matching walks
// forward, so a stop is never placed behind the previous one on looping routes.
func placeStops(ds *Dataset, line *geo.Polyline, stopIDs []string) map[string]float64 {
	offsets := make(map[string]float64, len(stopIDs))
	fromSeg := 0
	for _, id := range stopIDs {
		stop := ds.StopsByID[id]
		if stop == nil {
			continue
		}
		offset, dist, seg := line.Project(geo.Point{Lat: stop.Lat, Lng: stop.Lng}, fromSeg)
		if dist > 200 { // stop is nowhere near this shape; don't guess
			continue
		}
		offsets[id] = offset
		fromSeg = seg
	}
	return offsets
}

// Routes sort by their number (numerically where possible), trolleybuses first.
func routeLess(a, b Route) bool {
	if a.Type != b.Type {
		return a.Type == "trolleybus"
	}
	return numberLess(a.Number, b.Number)
}

func numberLess(a, b string) bool {
	na, errA := strconv.Atoi(a)
	nb, errB := strconv.Atoi(b)
	switch {
	case errA == nil && errB == nil && na != nb:
		return na < nb
	case errA == nil && errB != nil:
		return true
	case errA != nil && errB == nil:
		return false
	default:
		return a < b
	}
}

// knownStops drops ids that are not in the stop list.
func knownStops(ds *Dataset, ids []string) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if ds.StopsByID[id] != nil {
			out = append(out, id)
		}
	}
	return out
}

// stopDistances measures how far along a trip each stop lies. It uses the shape where
// a stop sits on it, and otherwise adds the straight-line hop from the previous stop.
// The result never decreases. shaped reports whether every stop was found on the shape.
func stopDistances(ds *Dataset, line *geo.Polyline, stopIDs []string) (dist []float64, shaped bool) {
	dist = make([]float64, len(stopIDs))
	shaped = line != nil
	fromSeg, prev := 0, 0.0
	var prevPos geo.Point
	for i, id := range stopIDs {
		stop := ds.StopsByID[id]
		pos := geo.Point{Lat: stop.Lat, Lng: stop.Lng}

		d, found := 0.0, false
		if line != nil {
			offset, off, seg := line.Project(pos, fromSeg)
			if off <= 200 {
				d, found, fromSeg = offset, true, seg
			}
		}
		if !found {
			shaped = false
			if i > 0 {
				d = prev + geo.Haversine(prevPos, pos)
			}
		}
		d = math.Max(d, prev)
		dist[i], prev, prevPos = d, d, pos
	}
	return dist, shaped
}
