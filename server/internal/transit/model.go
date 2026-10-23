// Package transit holds the domain model (routes, stops, vehicles, arrivals) and
// the logic over it: loading the static feed, search and arrival estimates.
//
// The JSON tags mirror client/src/api/types.ts.
package transit

type Route struct {
	ID      string   `json:"id"`
	Number  string   `json:"number"`
	Type    string   `json:"type"` // trolleybus | bus | minibus
	Name    string   `json:"name"`
	StopIDs []string `json:"stopIds"`
}

type Stop struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lng  float64 `json:"lng"`
}

// StopResult is a stop plus the route numbers that call there.
type StopResult struct {
	Stop
	RouteNumbers []string `json:"routeNumbers"`
}

// The two ways a route runs: its first direction in the feed, and the way back.
const (
	DirectionForward = "forward"
	DirectionBack    = "back"
)

// PathInfo says which way along its route a drawn path runs and where that leads.
type PathInfo struct {
	Direction string `json:"direction"`
	Toward    string `json:"toward,omitempty"` // the destination shown on the vehicle
}

// Vehicle is the public live position of one vehicle.
type Vehicle struct {
	ID      string  `json:"id"`
	Label   string  `json:"label"` // board number painted on the vehicle, e.g. "3878"
	RouteID string  `json:"routeId"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	// Heading is the direction of travel in degrees clockwise from north: the route's own
	// direction where the vehicle is on it, else the way the vehicle has been moving.
	// It only means something when HasHeading is true.
	Heading    float64 `json:"heading"`
	HasHeading bool    `json:"hasHeading"`
	SpeedKmh   int     `json:"speedKmh"`
	UpdatedAt  int64   `json:"updatedAt"` // unix ms of the last GPS fix
	// Which way along its route the vehicle runs, and where to; empty when unknown.
	Direction string `json:"direction,omitempty"`
	Toward    string `json:"toward,omitempty"`
}

// LiveVehicle adds what arrival estimates need but clients don't.
type LiveVehicle struct {
	Vehicle
	TripID string
}

type Arrival struct {
	RouteID     string `json:"routeId"`
	RouteNumber string `json:"routeNumber"`
	Type        string `json:"type"`
	VehicleID   string `json:"vehicleId"`
	ETASeconds  int    `json:"etaSeconds"`
}

// SearchResults. Places are the client's own, so the server always sends none.
type SearchResults struct {
	Routes []Route      `json:"routes"`
	Stops  []StopResult `json:"stops"`
	Places []struct{}   `json:"places"`
}
