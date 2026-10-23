package transit

import (
	"math"

	"droommd/server/internal/geo"
)

// maxHeadingOffDeg is how far a vehicle's heading may differ from a shape's direction for
// the vehicle to count as travelling along it.
const maxHeadingOffDeg = 60

// lookaheadM is how far ahead along its route a vehicle's arrow looks: it points at the
// spot on the route this far in front of the vehicle, not at its destination and not at
// the few meters right under its wheels, so it is steady on curves and noisy GPS fixes.
const lookaheadM = 100

// Orientation is how a vehicle sits on its route.
type Orientation struct {
	Direction string // DirectionForward or DirectionBack; empty when unknown
	Toward    string // the destination
	// Bearing is the direction from the vehicle's place on the route to the spot lookaheadM
	// further along it, in degrees clockwise from north. It is only meaningful when OnRoute.
	Bearing float64
	OnRoute bool
}

// DirectionOf says which way along its route a vehicle runs and where it is heading.
//
// Most vehicles report their trip, which fixes both. For the others the answer is
// inferred: of the route's trips whose shape passes close to the vehicle, the one the
// vehicle is moving along (not against) wins. Without a trip and without a known
// heading of travel the answer is empty rather than a guess.
func (d *Dataset) DirectionOf(v LiveVehicle, headingKnown bool) Orientation {
	pos := geo.Point{Lat: v.Lat, Lng: v.Lng}

	if tr := d.trips[v.TripID]; tr != nil {
		o := Orientation{Direction: tr.direction, Toward: tr.toward}
		if tr.line != nil {
			if offset, dist, _ := tr.line.Project(pos, 0); dist <= maxOffRouteM {
				o.Bearing, o.OnRoute = tr.line.BearingAhead(offset, lookaheadM), true
			}
		}
		return o
	}
	if !headingKnown {
		return Orientation{}
	}

	var best Orientation
	bestDist := math.Inf(1)
	for _, tr := range d.routeTrips[v.RouteID] {
		if tr.line == nil {
			continue
		}
		offset, dist, _ := tr.line.Project(pos, 0)
		if dist > maxOffRouteM || dist >= bestDist {
			continue
		}
		// Whether it moves along the shape is judged by the shape right under it.
		if angleBetween(tr.line.BearingAt(offset), v.Heading) > maxHeadingOffDeg {
			continue // not clearly moving along this shape (across it, or the other way)
		}
		best, bestDist = Orientation{
			Direction: tr.direction, Toward: tr.toward,
			Bearing: tr.line.BearingAhead(offset, lookaheadM), OnRoute: true,
		}, dist
	}
	return best
}

// angleBetween is the smaller angle between two bearings, 0-180 degrees.
func angleBetween(a, b float64) float64 {
	d := math.Mod(math.Abs(a-b), 360)
	if d > 180 {
		d = 360 - d
	}
	return d
}
