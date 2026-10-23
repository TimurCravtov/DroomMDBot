package transit

import (
	"testing"

	"droommd/server/internal/geo"
)

// A route running east-west along latitude 47: the forward trip heads east, the back trip
// (same street) heads west.
func eastWestRoute() *Dataset {
	east := geo.NewPolyline([]geo.Point{{Lat: 47, Lng: 28.80}, {Lat: 47, Lng: 28.8132}})
	west := geo.NewPolyline([]geo.Point{{Lat: 47.00005, Lng: 28.8132}, {Lat: 47.00005, Lng: 28.80}})
	fwd := &trip{id: "1_0", routeID: "1", line: east, direction: DirectionForward, toward: "Aeroport"}
	back := &trip{id: "1_1", routeID: "1", line: west, direction: DirectionBack, toward: "Centru"}
	return &Dataset{
		trips:      map[string]*trip{"1_0": fwd, "1_1": back},
		routeTrips: map[string][]*trip{"1": {fwd, back}},
	}
}

func TestDirectionComesFromTheVehiclesTrip(t *testing.T) {
	ds := eastWestRoute()
	// On the street, a little way along the westbound trip.
	v := LiveVehicle{Vehicle: Vehicle{RouteID: "1", Lat: 47.00005, Lng: 28.807}, TripID: "1_1"}
	o := ds.DirectionOf(v, false)
	if o.Direction != DirectionBack || o.Toward != "Centru" {
		t.Errorf("got %q toward %q, want back toward Centru", o.Direction, o.Toward)
	}
	if !o.OnRoute || angleBetween(o.Bearing, 270) > 2 {
		t.Errorf("bearing = %.1f (on route: %v), want ~270 along the westbound shape", o.Bearing, o.OnRoute)
	}

	// Far from the trip's shape the direction is still known, but the bearing is not.
	v.Lat = 47.01
	if o := ds.DirectionOf(v, false); o.Direction != DirectionBack || o.OnRoute {
		t.Errorf("off-route vehicle: %+v, want direction back without a bearing", o)
	}
}

func TestDirectionIsInferredFromHeadingWhenThereIsNoTrip(t *testing.T) {
	ds := eastWestRoute()
	at := func(heading float64, known bool) Orientation {
		return ds.DirectionOf(LiveVehicle{Vehicle: Vehicle{RouteID: "1", Lat: 47.00002, Lng: 28.807, Heading: heading}}, known)
	}

	if o := at(80, true); o.Direction != DirectionForward || o.Toward != "Aeroport" || angleBetween(o.Bearing, 90) > 2 {
		t.Errorf("heading east: %+v, want forward toward Aeroport with a ~90 bearing", o)
	}
	if o := at(270, true); o.Direction != DirectionBack || o.Toward != "Centru" {
		t.Errorf("heading west: %+v, want back toward Centru", o)
	}
	// Heading 0 is what an unmoved vehicle reports; it must not be taken as "north".
	if o := at(0, false); o.Direction != "" {
		t.Errorf("unknown heading: %+v, want no direction", o)
	}
	// Heading across the route fits neither trip.
	if o := at(0, true); o.Direction != "" {
		t.Errorf("heading north across the route: %+v, want no direction", o)
	}
}

func TestInferenceIgnoresVehiclesFarFromTheRoute(t *testing.T) {
	ds := eastWestRoute()
	v := LiveVehicle{Vehicle: Vehicle{RouteID: "1", Lat: 47.01, Lng: 28.807, Heading: 90}}
	if o := ds.DirectionOf(v, true); o.Direction != "" {
		t.Errorf("vehicle 1 km off the route got direction %q", o.Direction)
	}
}

func TestAngleBetweenWrapsAroundNorth(t *testing.T) {
	for _, c := range []struct{ a, b, want float64 }{{10, 350, 20}, {350, 10, 20}, {90, 270, 180}, {0, 0, 0}, {45, 100, 55}} {
		if got := angleBetween(c.a, c.b); got != c.want {
			t.Errorf("angleBetween(%v, %v) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}
