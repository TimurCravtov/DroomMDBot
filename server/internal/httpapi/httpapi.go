// Package httpapi exposes the transit data over HTTP: JSON for static data and
// searches, server-sent events for live vehicles.
package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"droommd/server/internal/auth"
	"droommd/server/internal/config"
	"droommd/server/internal/fleet"
	"droommd/server/internal/geo"
	"droommd/server/internal/geocode"
	"droommd/server/internal/store"
	"droommd/server/internal/transit"
	"droommd/server/internal/walking"
)

// Deps are the services the handlers use.
type Deps struct {
	Dataset  *atomic.Pointer[transit.Dataset]
	Fleet    *fleet.Fleet
	Geocoder *geocode.Client
	Walker   *walking.Client // nil: walking legs stay straight lines
	Store    *store.Store
}

type Server struct {
	cfg      config.Config
	ds       *atomic.Pointer[transit.Dataset]
	fleet    *fleet.Fleet
	geocoder *geocode.Client
	walker   *walking.Client
	store    *store.Store
	auth     auth.Config
}

func New(cfg config.Config, d Deps) *Server {
	return &Server{
		cfg: cfg, ds: d.Dataset, fleet: d.Fleet, geocoder: d.Geocoder, walker: d.Walker, store: d.Store,
		auth: auth.Config{BotToken: cfg.BotToken, MaxAge: cfg.AuthMaxAge, AllowAnon: cfg.AllowAnon},
	}
}

// Handler returns the routed handler with logging and CORS applied.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /api/routes", s.routes)
	mux.HandleFunc("GET /api/routes/{id}/shapes", s.routeShapes)
	mux.HandleFunc("GET /api/stops", s.stops)
	mux.HandleFunc("GET /api/stops/{id}/arrivals", s.arrivals)
	mux.HandleFunc("GET /api/search", s.search)
	mux.HandleFunc("GET /api/geocode", s.geocode)
	mux.HandleFunc("GET /api/plan", s.plan)
	mux.HandleFunc("GET /api/vehicles", s.vehicles)
	mux.HandleFunc("GET /api/vehicles/stream", s.streamVehicles)

	// Per-user data: every one of these needs a verified caller.
	mine := func(h http.HandlerFunc) http.Handler { return s.auth.Middleware(h) }
	mux.Handle("GET /api/me/places", mine(s.listPlaces))
	mux.Handle("POST /api/me/places", mine(s.savePlace))
	mux.Handle("DELETE /api/me/places/{id}", mine(s.deletePlace))
	mux.Handle("DELETE /api/me", mine(s.deleteMe))
	return s.withCORS(withLogging(mux))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("writing response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// cacheStatic marks responses that only change when the static feed is refreshed.
func cacheStatic(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "public, max-age=300")
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ds := s.ds.Load()
	vehicles, updated := s.fleet.Live()
	storage := "ok"
	if err := s.store.Ping(r.Context()); err != nil {
		storage = "unavailable"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":          "ok",
		"storage":         storage,
		"routes":          len(ds.Routes),
		"stops":           len(ds.Stops),
		"vehicles":        len(vehicles),
		"vehiclesUpdated": updated,
	})
}

func (s *Server) routes(w http.ResponseWriter, _ *http.Request) {
	cacheStatic(w)
	writeJSON(w, http.StatusOK, s.ds.Load().Routes)
}

func (s *Server) stops(w http.ResponseWriter, _ *http.Request) {
	cacheStatic(w)
	writeJSON(w, http.StatusOK, s.ds.Load().Stops)
}

func (s *Server) routeShapes(w http.ResponseWriter, r *http.Request) {
	ds := s.ds.Load()
	id := r.PathValue("id")
	if ds.RoutesByID[id] == nil {
		writeError(w, http.StatusNotFound, "unknown route")
		return
	}
	paths := ds.RouteShapes[id]
	if paths == nil {
		paths = [][][2]float64{}
	}
	cacheStatic(w)
	writeJSON(w, http.StatusOK, map[string]any{"paths": paths})
}

func (s *Server) arrivals(w http.ResponseWriter, r *http.Request) {
	ds := s.ds.Load()
	id := r.PathValue("id")
	if ds.StopsByID[id] == nil {
		writeError(w, http.StatusNotFound, "unknown stop")
		return
	}
	vehicles, _ := s.fleet.Live()
	writeJSON(w, http.StatusOK, ds.ArrivalsAt(vehicles, id, time.Now()))
}

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.ds.Load().Search(r.URL.Query().Get("q")))
}

// routeFilter parses ?routes=1,2,3 into a set; empty means every route.
func routeFilter(r *http.Request) map[string]bool {
	set := map[string]bool{}
	for _, id := range strings.Split(r.URL.Query().Get("routes"), ",") {
		if id = strings.TrimSpace(id); id != "" {
			set[id] = true
		}
	}
	return set
}

func (s *Server) vehicles(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.fleet.Vehicles(routeFilter(r)))
}

// streamVehicles pushes the vehicle list as server-sent events: once on connect,
// then after every upstream refresh.
func (s *Server) streamVehicles(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no") // tell nginx not to buffer the stream

	filter := routeFilter(r)
	updates, unsubscribe := s.fleet.Subscribe()
	defer unsubscribe()

	send := func() error {
		payload, err := json.Marshal(s.fleet.Vehicles(filter))
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	if send() != nil {
		return
	}
	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-updates:
			if send() != nil {
				return
			}
		case <-keepalive.C:
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return cors(s.cfg.CORSOrigin, next)
}

// cors lets browsers on other origins call the API. allowed is a comma-separated list of
// origins (or "*"); empty disables CORS, which is right when the client is served from the
// same origin. Requests carry credentials in the Authorization header, not cookies, so
// "*" is safe, and browsers send a preflight (OPTIONS) first because of that header: it is
// answered here, without reaching the handlers.
func cors(allowed string, next http.Handler) http.Handler {
	origins := map[string]bool{}
	for _, o := range strings.Split(allowed, ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			origins[o] = true
		}
	}
	if len(origins) == 0 {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Add("Vary", "Origin")

		switch {
		case origins["*"]:
			w.Header().Set("Access-Control-Allow-Origin", "*")
		case origin != "" && origins[origin]:
			w.Header().Set("Access-Control-Allow-Origin", origin)
		default:
			next.ServeHTTP(w, r) // not an allowed origin: no CORS headers, the browser blocks it
			return
		}

		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			h := w.Header()
			h.Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		// Streams are long-lived; logging them on close is enough.
		log.Printf("%s %s (%s)", r.Method, r.URL.RequestURI(), time.Since(start).Round(time.Millisecond))
	})
}

func (s *Server) geocode(w http.ResponseWriter, r *http.Request) {
	results, err := s.geocoder.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		if r.Context().Err() != nil {
			return // the client went away
		}
		log.Printf("geocode: %v", err)
		writeError(w, http.StatusBadGateway, "address lookup is unavailable")
		return
	}
	writeJSON(w, http.StatusOK, results)
}

// parsePoint reads "lat,lng".
func parsePoint(v string) (geo.Point, bool) {
	latStr, lngStr, ok := strings.Cut(v, ",")
	if !ok {
		return geo.Point{}, false
	}
	lat, errLat := strconv.ParseFloat(strings.TrimSpace(latStr), 64)
	lng, errLng := strconv.ParseFloat(strings.TrimSpace(lngStr), 64)
	if errLat != nil || errLng != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return geo.Point{}, false
	}
	return geo.Point{Lat: lat, Lng: lng}, true
}

// plan answers /api/plan?from=lat,lng&to=lat,lng with itineraries, fastest first.
func (s *Server) plan(w http.ResponseWriter, r *http.Request) {
	from, okFrom := parsePoint(r.URL.Query().Get("from"))
	to, okTo := parsePoint(r.URL.Query().Get("to"))
	if !okFrom || !okTo {
		writeError(w, http.StatusBadRequest, "from and to must be lat,lng")
		return
	}

	ds := s.ds.Load()
	vehicles, _ := s.fleet.Live()
	now := time.Now()

	// Live waits: the soonest vehicle of a route at a stop, from the arrival estimates.
	// Each stop is estimated once per request, however many options board there.
	cache := map[string][]transit.Arrival{}
	wait := func(routeID, stopID string, notBefore float64) (float64, bool) {
		arrivals, ok := cache[stopID]
		if !ok {
			arrivals = ds.ArrivalsAt(vehicles, stopID, now)
			cache[stopID] = arrivals
		}
		for _, a := range arrivals { // sorted soonest first
			if a.RouteID == routeID && float64(a.ETASeconds) >= notBefore {
				return float64(a.ETASeconds), true
			}
		}
		return 0, false
	}

	itineraries := ds.Plan(from, to, wait)

	// Walking legs follow real streets when the router answers in time; otherwise they
	// stay straight lines.
	if s.walker != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		defer cancel()
		itineraries = transit.RefineWalks(ctx, itineraries, func(ctx context.Context, a, b geo.Point) (transit.WalkRoute, error) {
			route, err := s.walker.Route(ctx, a, b)
			return transit.WalkRoute{Path: route.Path, DistanceM: route.DistanceM}, err
		})
	}
	writeJSON(w, http.StatusOK, itineraries)
}
