package transit

import (
	"testing"

	"droommd/server/internal/geo"
)

// testNetwork builds a tiny feed:
//
//	A: A1 ──── A2 ──── A3        runs west to east along latitude 47.000
//	                    B1 ── B2  B starts ~55 m from A3 and runs north
//	C: C1 ───────────────── C2   optional direct line from A1's area to B2's area
func testNetwork(withDirect bool) *Dataset {
	stops := []Stop{
		{ID: "A1", Name: "A one", Lat: 47.000, Lng: 28.800},
		{ID: "A2", Name: "A two", Lat: 47.000, Lng: 28.820},
		{ID: "A3", Name: "A three", Lat: 47.000, Lng: 28.840},
		{ID: "B1", Name: "B one", Lat: 47.0004, Lng: 28.8402},
		{ID: "B2", Name: "B two", Lat: 47.020, Lng: 28.8402},
		{ID: "C1", Name: "C one", Lat: 47.0003, Lng: 28.8003},
		{ID: "C2", Name: "C two", Lat: 47.0198, Lng: 28.8399},
	}
	ds := &Dataset{
		Stops:      stops,
		StopsByID:  map[string]*Stop{},
		RoutesByID: map[string]*Route{},
		trips:      map[string]*trip{},
	}
	for i := range ds.Stops {
		ds.StopsByID[ds.Stops[i].ID] = &ds.Stops[i]
	}

	addRoute := func(id, number, typ string, stopIDs ...string) {
		ds.RoutesByID[id] = &Route{ID: id, Number: number, Type: typ}
		tr := &trip{id: id + "_0", routeID: id, stops: stopIDs}
		tr.dist, tr.shaped = stopDistances(ds, nil, stopIDs)
		ds.trips[tr.id] = tr
	}
	addRoute("A", "1", "trolleybus", "A1", "A2", "A3")
	addRoute("B", "7", "bus", "B1", "B2")
	if withDirect {
		addRoute("C", "9", "bus", "C1", "C2")
	}
	ds.index()
	return ds
}

var (
	// About 100 m from the stops A1 and B2, so walking legs to and from them are kept.
	nearA1 = geo.Point{Lat: 47.0009, Lng: 28.8001}
	nearB2 = geo.Point{Lat: 47.0209, Lng: 28.8401}
)

func routeNumbers(it Itinerary) []string {
	var out []string
	for _, l := range it.Legs {
		if l.Mode == "transit" {
			out = append(out, l.RouteNumber)
		}
	}
	return out
}

func TestPlanFindsATransfer(t *testing.T) {
	got := testNetwork(false).Plan(nearA1, nearB2, nil)
	if len(got) == 0 {
		t.Fatal("no itinerary; want one that changes from A to B")
	}
	it := got[0]
	if it.Transfers != 1 {
		t.Fatalf("transfers = %d, want 1", it.Transfers)
	}
	if r := routeNumbers(it); len(r) != 2 || r[0] != "1" || r[1] != "7" {
		t.Fatalf("routes = %v, want [1 7]", r)
	}

	// walk to A1, ride A, walk to B1, ride B, walk to the destination
	modes := ""
	for _, l := range it.Legs {
		modes += l.Mode[:1]
	}
	if modes != "wtwtw" {
		t.Errorf("leg modes = %q, want walk, ride, walk, ride, walk", modes)
	}

	sum := 0
	for _, l := range it.Legs {
		sum += l.DurationS + l.WaitS
		if len(l.Path) < 2 {
			t.Errorf("leg %+v has no drawable path", l)
		}
	}
	if sum != it.DurationS {
		t.Errorf("DurationS = %d, but legs add up to %d", it.DurationS, sum)
	}
	if it.DurationS < 600 || it.DurationS > 7200 {
		t.Errorf("DurationS = %d s looks implausible for a ~3 km trip with a change", it.DurationS)
	}
}

func TestPlanPrefersADirectLine(t *testing.T) {
	got := testNetwork(true).Plan(nearA1, nearB2, nil)
	if len(got) == 0 {
		t.Fatal("no itinerary")
	}
	if got[0].Transfers != 0 || routeNumbers(got[0])[0] != "9" {
		t.Errorf("best = %v with %d transfers, want direct line 9", routeNumbers(got[0]), got[0].Transfers)
	}
	// The change via A then B is still offered as an alternative.
	foundTransfer := false
	for _, it := range got {
		if it.Transfers == 1 {
			foundTransfer = true
		}
	}
	if !foundTransfer {
		t.Error("expected the transfer itinerary to be listed as an alternative")
	}
}

func TestPlanUsesLiveWait(t *testing.T) {
	ds := testNetwork(true)
	base := ds.Plan(nearA1, nearB2, nil)[0]

	soon := func(routeID, stopID string, notBefore float64) (float64, bool) {
		return notBefore + 30, true // a vehicle arrives 30 s after we do
	}
	live := ds.Plan(nearA1, nearB2, soon)[0]

	waitOf := func(it Itinerary) int {
		for _, l := range it.Legs {
			if l.Mode == "transit" {
				return l.WaitS
			}
		}
		return -1
	}
	if waitOf(base) != int(defaultWaitS) {
		t.Errorf("default wait = %d, want %d", waitOf(base), int(defaultWaitS))
	}
	if waitOf(live) != 30 {
		t.Errorf("live wait = %d, want 30", waitOf(live))
	}
	if live.DurationS >= base.DurationS {
		t.Errorf("a vehicle arriving sooner should shorten the trip: %d vs %d", live.DurationS, base.DurationS)
	}
}

func TestPlanOffersWalkingForShortDistancesOnly(t *testing.T) {
	ds := testNetwork(false)

	a := geo.Point{Lat: 47.0001, Lng: 28.8001}
	b := geo.Point{Lat: 47.0010, Lng: 28.8010}
	got := ds.Plan(a, b, nil)
	if len(got) == 0 || got[0].Legs[0].Mode != "walk" || len(got[0].Legs) != 1 {
		t.Errorf("a ~130 m trip should be a single walk, got %+v", got)
	}

	// Far from every stop and too far to walk: nothing to offer.
	far := geo.Point{Lat: 47.2, Lng: 29.2}
	if got := ds.Plan(far, nearB2, nil); len(got) != 0 {
		t.Errorf("trip from nowhere returned %+v, want none", got)
	}
}

func TestStopDistancesAreNonDecreasing(t *testing.T) {
	ds := testNetwork(false)
	for _, tr := range ds.trips {
		for i := 1; i < len(tr.dist); i++ {
			if tr.dist[i] < tr.dist[i-1] {
				t.Errorf("trip %s: dist[%d]=%.1f < dist[%d]=%.1f", tr.id, i, tr.dist[i], i-1, tr.dist[i-1])
			}
		}
	}
}
