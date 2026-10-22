// Command server exposes live Chișinău public transport data (from the Tranzy
// open data API) to the web client as a small JSON + server-sent-events API.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"droommd/server/internal/config"
	"droommd/server/internal/fleet"
	"droommd/server/internal/geocode"
	"droommd/server/internal/httpapi"
	"droommd/server/internal/store"
	"droommd/server/internal/transit"
	"droommd/server/internal/tranzy"
	"droommd/server/internal/walking"
)

func main() {
	// `server healthcheck` is for Docker's HEALTHCHECK: the runtime image has no curl.
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.BotToken == "" && !cfg.AllowAnon {
		log.Print("warning: neither TELEGRAM_BOT_TOKEN nor AUTH_ALLOW_ANON is set, so nobody can sign in to save places")
	}
	if cfg.AllowAnon {
		log.Print("warning: AUTH_ALLOW_ANON is on: any browser can create an anonymous account (fine for testing)")
	}

	db, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("opening database %s: %v", cfg.DBPath, err)
	}
	defer db.Close()
	log.Printf("database: %s", cfg.DBPath)

	if cfg.BackupEvery > 0 {
		go backupLoop(ctx, db, cfg)
	} else {
		log.Print("database backups are off (BACKUP_EVERY)")
	}

	up := tranzy.New(cfg.BaseURL, cfg.APIKey, cfg.AgencyID)

	log.Printf("loading static feed (agency %s)…", cfg.AgencyID)
	start := time.Now()
	ds, err := transit.Load(ctx, up)
	if err != nil {
		log.Fatalf("loading static feed: %v", err)
	}
	log.Printf("loaded %d routes, %d stops, %d trips in %s",
		len(ds.Routes), len(ds.Stops), ds.TripCount(), time.Since(start).Round(time.Millisecond))

	var current atomic.Pointer[transit.Dataset]
	current.Store(ds)
	go refreshStatic(ctx, up, &current, cfg.StaticRefresh)

	live := fleet.New()
	go live.Run(ctx, up, &current, cfg)

	var walker *walking.Client
	if cfg.WalkingURL != "" && cfg.WalkingURL != "off" {
		walker = walking.New(cfg.WalkingURL, cfg.GeocoderAgent)
	}

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: httpapi.New(cfg, httpapi.Deps{
			Dataset:  &current,
			Fleet:    live,
			Geocoder: geocode.New(cfg.GeocoderURL, cfg.GeocoderAgent),
			Walker:   walker,
			Store:    db,
		}).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: it would cut off the event stream.
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	log.Printf("listening on %s", cfg.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

// refreshStatic reloads routes, stops and shapes periodically; a failed refresh
// keeps serving the previous data.
func refreshStatic(ctx context.Context, up *tranzy.Client, current *atomic.Pointer[transit.Dataset], every time.Duration) {
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
		ds, err := transit.Load(ctx, up)
		if err != nil {
			log.Printf("refreshing static feed: %v (keeping previous data)", err)
			continue
		}
		current.Store(ds)
		log.Printf("static feed refreshed: %d routes, %d stops", len(ds.Routes), len(ds.Stops))
	}
}

// healthcheck asks the locally running server whether it is healthy and returns an
// exit code: 0 for healthy, 1 otherwise.
func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

// backupLoop keeps rolling backups of the database next to it: one every cfg.BackupEvery,
// the newest cfg.BackupKeep kept. It checks hourly (or more often for short intervals), so a
// restart never skips a backup that is due and never makes a redundant one.
func backupLoop(ctx context.Context, db *store.Store, cfg config.Config) {
	check := min(cfg.BackupEvery, time.Hour)
	tick := time.NewTicker(check)
	defer tick.Stop()
	for {
		made, err := db.BackupIfDue(ctx, cfg.BackupDir, cfg.BackupEvery, cfg.BackupKeep, time.Now())
		switch {
		case err != nil:
			log.Printf("database backup failed: %v", err)
		case made:
			log.Printf("database backed up to %s (keeping %d)", cfg.BackupDir, cfg.BackupKeep)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
