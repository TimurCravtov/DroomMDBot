package geo

import (
	"math"
	"testing"
)

// A straight line running due east for about 1 km along latitude 47.
func eastLine() *Polyline {
	return NewPolyline([]Point{{47, 28.80}, {47, 28.8066}, {47, 28.8132}})
}

func TestProjectMeasuresProgressAlongLine(t *testing.T) {
	line := eastLine()
	// A point just north of the midpoint of the first segment projects onto it.
	offset, dist, seg := line.Project(Point{47.0001, 28.8033}, 0)
	if seg != 0 {
		t.Fatalf("segment = %d, want 0", seg)
	}
	if want := line.cum[1] / 2; math.Abs(offset-want) > 2 {
		t.Errorf("offset = %.1f, want about %.1f", offset, want)
	}
	if math.Abs(dist-11.1) > 1 { // 0.0001° of latitude ≈ 11.1 m
		t.Errorf("dist = %.1f, want about 11.1", dist)
	}
}

func TestProjectHonoursStartSegment(t *testing.T) {
	line := eastLine()
	// Near the start of the line, but we only look from segment 1 on.
	offset, _, seg := line.Project(Point{47, 28.8001}, 1)
	if seg != 1 {
		t.Fatalf("segment = %d, want 1", seg)
	}
	if offset < line.cum[1] {
		t.Errorf("offset %.1f is behind segment 1 start %.1f", offset, line.cum[1])
	}
}

func TestLengthIsLastCumulativeDistance(t *testing.T) {
	line := eastLine()
	if line.Length() != line.cum[2] || line.Length() < 900 || line.Length() > 1100 {
		t.Errorf("length = %.1f, want about 1000", line.Length())
	}
}

func TestBearing(t *testing.T) {
	cases := []struct {
		to   Point
		want float64
	}{
		{Point{47.01, 28.8}, 0},
		{Point{47, 28.81}, 90},
		{Point{46.99, 28.8}, 180},
		{Point{47, 28.79}, 270},
	}
	for _, c := range cases {
		if got := Bearing(Point{47, 28.8}, c.to); math.Abs(got-c.want) > 0.5 {
			t.Errorf("bearing to %+v = %.1f, want %.1f", c.to, got, c.want)
		}
	}
}
