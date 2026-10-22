package transit

import (
	"testing"
	"time"

	"droommd/server/internal/geo"
)

func TestSearchIgnoresDiacriticsAndMatchesTypeWords(t *testing.T) {
	ds := &Dataset{
		Routes: []Route{
			{ID: "1", Number: "22", Type: "trolleybus", Name: "Gara Feroviară - Rîșcani"},
			{ID: "2", Number: "22", Type: "bus", Name: "Centru - Botanica"},
			{ID: "3", Number: "5", Type: "bus", Name: "Aeroport - Centru"},
			{ID: "4", Number: "7", Type: "minibus", Name: "Ciocana - Centru"},
		},
		Stops:      []Stop{{ID: "10", Name: "Piața Centrală"}},
		stopRoutes: map[string][]string{"10": {"22"}},
	}

	ids := func(r SearchResults) []string {
		out := []string{}
		for _, route := range r.Routes {
			out = append(out, route.ID)
		}
		return out
	}
	equal := func(a, b []string) bool {
		if len(a) != len(b) {
			return false
		}
		for i := range a {
			if a[i] != b[i] {
				return false
			}
		}
		return true
	}

	cases := []struct {
		query string
		want  []string
	}{
		{"22", []string{"1", "2"}},        // same number on two vehicle types
		{"22 bus", []string{"2"}},         // number plus type word
		{"troleibuz", []string{"1"}},      // Romanian type word
		{"bus", []string{"2", "3"}},       // must not match "trolleybus" or "minibus"
		{"autobuz 5", []string{"3"}},      // Romanian word plus number
		{"riscani", []string{"1"}},        // diacritics ignored in names
		{"nothing-like-this", []string{}}, // no match
	}
	for _, c := range cases {
		if got := ids(ds.Search(c.query)); !equal(got, c.want) {
			t.Errorf("Search(%q) routes = %v, want %v", c.query, got, c.want)
		}
	}

	if got := ds.Search("piata"); len(got.Stops) != 1 || got.Stops[0].RouteNumbers[0] != "22" {
		t.Errorf("Search(piata) stops = %+v, want the one stop with its route numbers", got.Stops)
	}
}

func TestArrivalsUseProgressAlongTrip(t *testing.T) {
	// A straight line running due east for about 1 km along latitude 47.
	line := geo.NewPolyline([]geo.Point{{Lat: 47, Lng: 28.80}, {Lat: 47, Lng: 28.8066}, {Lat: 47, Lng: 28.8132}})
	ds := &Dataset{
		RoutesByID: map[string]*Route{"1": {ID: "1", Number: "22", Type: "bus"}},
		trips: map[string]*trip{
			"1_0": {id: "1_0", routeID: "1", line: line, stopOffsets: map[string]float64{"end": line.Length(), "start": 0}},
		},
	}
	now := time.Now()
	vehicle := func(id string, lng float64) LiveVehicle {
		return LiveVehicle{
			Vehicle: Vehicle{ID: id, RouteID: "1", Lat: 47, Lng: lng, UpdatedAt: now.UnixMilli()},
			TripID:  "1_0",
		}
	}
	vehicles := []LiveVehicle{vehicle("near", 28.8100), vehicle("far", 28.8010)}

	got := ds.ArrivalsAt(vehicles, "end", now)
	if len(got) != 2 || got[0].VehicleID != "near" || got[0].ETASeconds >= got[1].ETASeconds {
		t.Fatalf("arrivals at end = %+v, want near before far", got)
	}

	// Both vehicles have already passed the start stop.
	if got := ds.ArrivalsAt(vehicles, "start", now); len(got) != 0 {
		t.Errorf("arrivals at start = %+v, want none", got)
	}

	// A vehicle far off its trip's shape is ignored.
	off := vehicle("off", 28.8100)
	off.Lat = 47.01
	if got := ds.ArrivalsAt([]LiveVehicle{off}, "end", now); len(got) != 0 {
		t.Errorf("off-route vehicle produced arrivals: %+v", got)
	}

	// An old position means the vehicle has probably advanced: the ETA shrinks.
	stale := vehicle("stale", 28.8010)
	stale.UpdatedAt = now.Add(-60 * time.Second).UnixMilli()
	fresh := ds.ArrivalsAt([]LiveVehicle{vehicle("fresh", 28.8010)}, "end", now)[0].ETASeconds
	aged := ds.ArrivalsAt([]LiveVehicle{stale}, "end", now)[0].ETASeconds
	if aged >= fresh {
		t.Errorf("stale ETA %ds should be below fresh ETA %ds", aged, fresh)
	}
}
