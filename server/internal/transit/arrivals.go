package transit

import (
	"math"
	"sort"
	"time"

	"droommd/server/internal/geo"
)

const (
	// The feed has no schedule, so ETAs assume a typical city speed.
	averageSpeedMS = 6.0
	// A vehicle further than this from its trip's shape is on a detour or the wrong trip.
	maxOffRouteM = 150
	// Allowance for GPS noise when a vehicle is just past the stop.
	passedToleranceM = 30
	maxETA           = 45 * time.Minute
)

// ArrivalsAt estimates when vehicles will reach a stop. Only vehicles that report
// which trip they run can be placed; the rest are skipped.
func (d *Dataset) ArrivalsAt(vehicles []LiveVehicle, stopID string, now time.Time) []Arrival {
	out := []Arrival{}
	for _, v := range vehicles {
		tr := d.trips[v.TripID]
		if tr == nil || tr.line == nil {
			continue
		}
		stopOffset, ok := tr.stopOffsets[stopID]
		if !ok {
			continue
		}
		offset, dist, _ := tr.line.Project(geo.Point{Lat: v.Lat, Lng: v.Lng}, 0)
		if dist > maxOffRouteM {
			continue
		}
		ahead := stopOffset - offset
		if ahead < -passedToleranceM {
			continue // already passed this stop
		}
		ahead = math.Max(ahead, 0)

		// The position is a few seconds to minutes old; the vehicle has moved on since.
		age := now.Sub(time.UnixMilli(v.UpdatedAt)).Seconds()
		eta := math.Max(ahead/averageSpeedMS-age, 0)
		if time.Duration(eta*float64(time.Second)) > maxETA {
			continue
		}

		route := d.RoutesByID[v.RouteID]
		if route == nil {
			continue
		}
		out = append(out, Arrival{
			RouteID: route.ID, RouteNumber: route.Number, Type: route.Type,
			VehicleID: v.ID, ETASeconds: int(math.Round(eta)),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ETASeconds < out[j].ETASeconds })
	return out
}
