package transit

import (
	"math"
	"sort"

	"droommd/server/internal/geo"
)

// Journey planning over the static feed. There is no timetable, so times are
// estimates: walking at a fixed pace, riding at a typical city speed along the
// route's shape, and waiting for the next vehicle (live, when one is known).
// It finds direct trips and trips with one transfer.

const (
	walkSpeedMS = 1.25 // 4.5 km/h
	// Straight-line distances understate real walking distance.
	walkDetour       = 1.25
	maxWalkToStopM   = 800
	maxTransferWalkM = 300
	// Only the nearest stops to each end are considered as boarding / alighting points.
	candidateStops = 25
	// How long to wait for a vehicle when none is known to be coming.
	defaultWaitS = 300.0
	// Walking the whole way is offered when the ends are this close.
	maxWalkOnlyM = 1500
	// Walking legs shorter than this are not shown (the stop is where you stand).
	minWalkLegM = 25

	refinedCandidates = 12
	maxItineraries    = 4
	maxTripSeconds    = 2 * 3600
)

// PlanPlace is an end of a leg. Name is empty for the trip's own start and destination;
// the client labels those.
type PlanPlace struct {
	Name string  `json:"name,omitempty"`
	Lat  float64 `json:"lat"`
	Lng  float64 `json:"lng"`
}

// Leg is either a walk or a ride on one route. Mirrors client/src/api/types.ts.
type Leg struct {
	Mode      string       `json:"mode"` // walk | transit
	From      PlanPlace    `json:"from"`
	To        PlanPlace    `json:"to"`
	DistanceM int          `json:"distanceM"`
	DurationS int          `json:"durationS"`
	Path      [][2]float64 `json:"path"` // [lng, lat] pairs

	// Transit legs only.
	RouteID     string `json:"routeId,omitempty"`
	RouteNumber string `json:"routeNumber,omitempty"`
	Type        string `json:"type,omitempty"`
	StopCount   int    `json:"stopCount,omitempty"`
	WaitS       int    `json:"waitS,omitempty"` // time waiting at the boarding stop
}

type Itinerary struct {
	DurationS int   `json:"durationS"` // door to door, including waiting
	WalkM     int   `json:"walkM"`
	Transfers int   `json:"transfers"`
	Legs      []Leg `json:"legs"`
}

// WaitFunc reports when the next vehicle of a route reaches a stop: the smallest
// ETA, in seconds, that is at least notBefore. ok is false when none is known.
type WaitFunc func(routeID, stopID string, notBefore float64) (etaS float64, ok bool)

// ride is a stretch of one trip, from its from-th to its to-th stop.
type ride struct {
	t        *trip
	from, to int
}

func (r ride) meters() float64 { return r.t.dist[r.to] - r.t.dist[r.from] }

// option is a candidate journey before it is turned into legs. Walk distances are
// straight-line meters.
type option struct {
	rides                    []ride
	walkIn, walkMid, walkOut float64
}

func walkSeconds(straightM float64) float64 { return straightM * walkDetour / walkSpeedMS }

// seconds estimates the whole journey, given the wait for the first vehicle.
func (o option) seconds(firstWaitS float64) float64 {
	total := walkSeconds(o.walkIn) + walkSeconds(o.walkMid) + walkSeconds(o.walkOut)
	for i, r := range o.rides {
		total += r.meters() / averageSpeedMS
		if i == 0 {
			total += firstWaitS
		} else {
			total += defaultWaitS
		}
	}
	return total
}

// Plan returns up to a few itineraries from one point to another, fastest first.
// wait may be nil, in which case every wait is the default.
func (d *Dataset) Plan(from, to geo.Point, wait WaitFunc) []Itinerary {
	straight := geo.Haversine(from, to)

	origins := capStops(d.stopsNear(from, maxWalkToStopM))
	destWalk := map[string]float64{} // stop id -> straight-line meters to the destination
	for _, s := range capStops(d.stopsNear(to, maxWalkToStopM)) {
		destWalk[s.stop.ID] = s.meters
	}

	// Best option per set of routes, so one line doesn't fill the list with variants.
	best := map[string]option{}
	consider := func(key string, o option) {
		if cur, ok := best[key]; !ok || o.seconds(defaultWaitS) < cur.seconds(defaultWaitS) {
			best[key] = o
		}
	}

	for _, origin := range origins {
		for _, ref1 := range d.stopRefs[origin.stop.ID] {
			t1 := ref1.trip
			for k := ref1.idx + 1; k < len(t1.stops); k++ {
				ride1 := ride{t1, ref1.idx, k}
				alight := t1.stops[k]

				if out, ok := destWalk[alight]; ok {
					consider(t1.routeID, option{rides: []ride{ride1}, walkIn: origin.meters, walkOut: out})
				}

				// One transfer: walk from the alighting stop to a stop of another route.
				x := d.StopsByID[alight]
				// The nearby list includes the alighting stop itself at 0 m: a same-stop change.
				for _, hop := range d.stopsNear(geo.Point{Lat: x.Lat, Lng: x.Lng}, maxTransferWalkM) {
					for _, ref2 := range d.stopRefs[hop.stop.ID] {
						t2 := ref2.trip
						if t2.routeID == t1.routeID {
							continue
						}
						for m := ref2.idx + 1; m < len(t2.stops); m++ {
							out, ok := destWalk[t2.stops[m]]
							if !ok {
								continue
							}
							consider(t1.routeID+"|"+t2.routeID, option{
								rides:   []ride{ride1, {t2, ref2.idx, m}},
								walkIn:  origin.meters,
								walkMid: hop.meters,
								walkOut: out,
							})
						}
					}
				}
			}
		}
	}

	// Rank by the default estimate, then re-rank the front-runners with live waits.
	type scored struct {
		o     option
		wait  float64
		total float64
	}
	cands := make([]scored, 0, len(best))
	for _, o := range best {
		cands = append(cands, scored{o: o, wait: defaultWaitS, total: o.seconds(defaultWaitS)})
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].total < cands[j].total })
	if len(cands) > refinedCandidates {
		cands = cands[:refinedCandidates]
	}
	if wait != nil {
		for i := range cands {
			first := cands[i].o.rides[0]
			notBefore := walkSeconds(cands[i].o.walkIn)
			if eta, ok := wait(first.t.routeID, first.t.stops[first.from], notBefore); ok {
				cands[i].wait = math.Max(eta-notBefore, 0)
				cands[i].total = cands[i].o.seconds(cands[i].wait)
			}
		}
		sort.Slice(cands, func(i, j int) bool { return cands[i].total < cands[j].total })
	}

	var out []Itinerary
	for _, c := range cands {
		if c.total > maxTripSeconds {
			continue
		}
		out = append(out, d.itinerary(c.o, from, to, c.wait))
	}

	if straight <= maxWalkOnlyM {
		out = append(out, walkOnly(from, to, straight))
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].DurationS < out[j].DurationS })

	// Drop options far slower than the best; they only add noise.
	if len(out) > 0 {
		limit := out[0].DurationS*2 + 600
		for i, it := range out {
			if it.DurationS > limit {
				out = out[:i]
				break
			}
		}
	}
	if len(out) > maxItineraries {
		out = out[:maxItineraries]
	}
	if out == nil {
		out = []Itinerary{}
	}
	return out
}

func capStops(s []nearStop) []nearStop {
	if len(s) > candidateStops {
		return s[:candidateStops]
	}
	return s
}

func walkOnly(from, to geo.Point, straight float64) Itinerary {
	leg := walkLeg(PlanPlace{Lat: from.Lat, Lng: from.Lng}, PlanPlace{Lat: to.Lat, Lng: to.Lng}, straight)
	return Itinerary{DurationS: leg.DurationS, WalkM: leg.DistanceM, Legs: []Leg{leg}}
}

func walkLeg(from, to PlanPlace, straightM float64) Leg {
	return Leg{
		Mode:      "walk",
		From:      from,
		To:        to,
		DistanceM: int(math.Round(straightM * walkDetour)),
		DurationS: int(math.Round(walkSeconds(straightM))),
		Path:      [][2]float64{{from.Lng, from.Lat}, {to.Lng, to.Lat}},
	}
}

func (d *Dataset) stopPlace(id string) PlanPlace {
	s := d.StopsByID[id]
	return PlanPlace{Name: s.Name, Lat: s.Lat, Lng: s.Lng}
}

// itinerary turns a chosen option into legs.
func (d *Dataset) itinerary(o option, from, to geo.Point, firstWaitS float64) Itinerary {
	start := PlanPlace{Lat: from.Lat, Lng: from.Lng}
	end := PlanPlace{Lat: to.Lat, Lng: to.Lng}

	var legs []Leg
	addWalk := func(a, b PlanPlace, straightM float64) {
		if straightM >= minWalkLegM {
			legs = append(legs, walkLeg(a, b, straightM))
		}
	}

	cursor := start
	for i, r := range o.rides {
		board := d.stopPlace(r.t.stops[r.from])
		alight := d.stopPlace(r.t.stops[r.to])
		if i == 0 {
			addWalk(cursor, board, o.walkIn)
		} else {
			addWalk(cursor, board, o.walkMid)
		}

		route := d.RoutesByID[r.t.routeID]
		wait := defaultWaitS
		if i == 0 {
			wait = firstWaitS
		}
		legs = append(legs, Leg{
			Mode:        "transit",
			From:        board,
			To:          alight,
			DistanceM:   int(math.Round(r.meters())),
			DurationS:   int(math.Round(r.meters() / averageSpeedMS)),
			Path:        r.path(d),
			RouteID:     r.t.routeID,
			RouteNumber: route.Number,
			Type:        route.Type,
			StopCount:   r.to - r.from,
			WaitS:       int(math.Round(wait)),
		})
		cursor = alight
	}
	addWalk(cursor, end, o.walkOut)

	it := Itinerary{Transfers: len(o.rides) - 1, Legs: legs}
	for _, l := range legs {
		it.DurationS += l.DurationS + l.WaitS
		if l.Mode == "walk" {
			it.WalkM += l.DistanceM
		}
	}
	return it
}

// path is the drawable way of a ride: the route's shape between the two stops where
// the stops were found on it, and otherwise straight lines through the stops.
func (r ride) path(d *Dataset) [][2]float64 {
	var pts []geo.Point
	if r.t.shaped && r.t.line != nil {
		pts = r.t.line.Slice(r.t.dist[r.from], r.t.dist[r.to])
	}
	if len(pts) < 2 {
		pts = pts[:0]
		for _, id := range r.t.stops[r.from : r.to+1] {
			s := d.StopsByID[id]
			pts = append(pts, geo.Point{Lat: s.Lat, Lng: s.Lng})
		}
	}
	out := make([][2]float64, len(pts))
	for i, p := range pts {
		out[i] = [2]float64{p.Lng, p.Lat}
	}
	return out
}
