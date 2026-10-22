package transit

import (
	"math"
	"sort"

	"droommd/server/internal/geo"
)

// stopRef says that a trip calls at a stop, as the idx-th stop of its sequence.
type stopRef struct {
	trip *trip
	idx  int
}

// cell is one square of the grid used to find stops near a point.
type cell struct{ lat, lng int }

// Cell sizes in degrees: about 440 m by 455 m around Chișinău.
const (
	cellLat = 0.004
	cellLng = 0.006
	cellM   = 440.0
)

func cellOf(lat, lng float64) cell {
	return cell{int(math.Floor(lat / cellLat)), int(math.Floor(lng / cellLng))}
}

// index builds the lookups the planner needs. Call it once after the stops and
// trips are filled in.
func (d *Dataset) index() {
	d.stopRefs = make(map[string][]stopRef)
	ids := make([]string, 0, len(d.trips))
	for id := range d.trips {
		ids = append(ids, id)
	}
	sort.Strings(ids) // deterministic results
	for _, id := range ids {
		tr := d.trips[id]
		for i, stopID := range tr.stops {
			d.stopRefs[stopID] = append(d.stopRefs[stopID], stopRef{tr, i})
		}
	}

	d.grid = make(map[cell][]int, len(d.Stops))
	for i, s := range d.Stops {
		c := cellOf(s.Lat, s.Lng)
		d.grid[c] = append(d.grid[c], i)
	}
}

// nearStop is a stop with its straight-line distance from a query point.
type nearStop struct {
	stop   *Stop
	meters float64
}

// stopsNear returns the stops within radiusM of p, nearest first.
func (d *Dataset) stopsNear(p geo.Point, radiusM float64) []nearStop {
	reach := int(math.Ceil(radiusM / cellM))
	home := cellOf(p.Lat, p.Lng)
	var out []nearStop
	for dLat := -reach; dLat <= reach; dLat++ {
		for dLng := -reach; dLng <= reach; dLng++ {
			for _, i := range d.grid[cell{home.lat + dLat, home.lng + dLng}] {
				s := &d.Stops[i]
				if m := geo.Haversine(p, geo.Point{Lat: s.Lat, Lng: s.Lng}); m <= radiusM {
					out = append(out, nearStop{s, m})
				}
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].meters < out[j].meters })
	return out
}
