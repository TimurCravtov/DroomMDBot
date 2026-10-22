// Package geo has the small amount of geometry the server needs: distances,
// bearings and measuring progress along a route's shape.
package geo

import "math"

type Point struct{ Lat, Lng float64 }

const earthRadiusM = 6_371_000.0

func rad(deg float64) float64 { return deg * math.Pi / 180 }

// Haversine returns the great-circle distance in meters.
func Haversine(a, b Point) float64 {
	dLat := rad(b.Lat - a.Lat)
	dLng := rad(b.Lng - a.Lng)
	h := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(rad(a.Lat))*math.Cos(rad(b.Lat))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * earthRadiusM * math.Asin(math.Sqrt(h))
}

// Bearing returns the direction from a to b in degrees clockwise from north, 0-359.
func Bearing(a, b Point) float64 {
	dLng := rad(b.Lng - a.Lng)
	y := math.Sin(dLng) * math.Cos(rad(b.Lat))
	x := math.Cos(rad(a.Lat))*math.Sin(rad(b.Lat)) - math.Sin(rad(a.Lat))*math.Cos(rad(b.Lat))*math.Cos(dLng)
	return math.Mod(math.Atan2(y, x)*180/math.Pi+360, 360)
}

// toXY maps a point to local planar meters, good enough over a city.
func toXY(p Point, refLat float64) (x, y float64) {
	return rad(p.Lng) * earthRadiusM * math.Cos(rad(refLat)), rad(p.Lat) * earthRadiusM
}

// Polyline is a path with cumulative distances, used to measure progress along a route.
type Polyline struct {
	pts []Point
	cum []float64 // cum[i] = meters from pts[0] to pts[i]
}

func NewPolyline(pts []Point) *Polyline {
	cum := make([]float64, len(pts))
	for i := 1; i < len(pts); i++ {
		cum[i] = cum[i-1] + Haversine(pts[i-1], pts[i])
	}
	return &Polyline{pts: pts, cum: cum}
}

// Length is the total length of the path in meters.
func (l *Polyline) Length() float64 {
	if len(l.cum) == 0 {
		return 0
	}
	return l.cum[len(l.cum)-1]
}

// Project finds the point of the polyline nearest to p, looking only at segments
// from index fromSeg on. It returns the distance along the line to that point,
// how far p is from the line, and the segment index. Starting later lets a caller
// walking along the route keep the match monotonic on looping routes.
func (l *Polyline) Project(p Point, fromSeg int) (offset, dist float64, seg int) {
	best := math.Inf(1)
	px, py := toXY(p, p.Lat)
	for i := max(fromSeg, 0); i+1 < len(l.pts); i++ {
		ax, ay := toXY(l.pts[i], p.Lat)
		bx, by := toXY(l.pts[i+1], p.Lat)
		dx, dy := bx-ax, by-ay

		t := 0.0
		if d2 := dx*dx + dy*dy; d2 > 0 {
			t = math.Max(0, math.Min(1, ((px-ax)*dx+(py-ay)*dy)/d2))
		}
		d := math.Hypot(px-(ax+t*dx), py-(ay+t*dy))
		if d < best {
			best = d
			offset = l.cum[i] + t*(l.cum[i+1]-l.cum[i])
			seg = i
		}
	}
	return offset, best, seg
}
