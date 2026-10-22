// Package httpapi exposes the transit data over HTTP: JSON for static data and
// searches, server-sent events for live vehicles.
package httpapi

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"droommd/server/internal/config"
	"droommd/server/internal/fleet"
	"droommd/server/internal/transit"
)

type Server struct {
	cfg   config.Config
	ds    *atomic.Pointer[transit.Dataset]
	fleet *fleet.Fleet
}

func New(cfg config.Config, ds *atomic.Pointer[transit.Dataset], f *fleet.Fleet) *Server {
	return &Server{cfg: cfg, ds: ds, fleet: f}
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
	mux.HandleFunc("GET /api/vehicles", s.vehicles)
	mux.HandleFunc("GET /api/vehicles/stream", s.streamVehicles)
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

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	ds := s.ds.Load()
	vehicles, updated := s.fleet.Live()
	writeJSON(w, http.StatusOK, map[string]any{
		"status":          "ok",
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
	if s.cfg.CORSOrigin == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", s.cfg.CORSOrigin)
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
