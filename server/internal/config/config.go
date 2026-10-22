// Package config reads the server's settings from the environment.
package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	APIKey        string
	BaseURL       string
	AgencyID      string
	Addr          string
	CORSOrigin    string
	GeocoderURL   string
	GeocoderAgent string
	WalkingURL    string
	DBPath        string
	BotToken      string
	AllowAnon     bool
	AuthMaxAge    time.Duration
	BackupDir     string
	BackupEvery   time.Duration // 0 turns backups off
	BackupKeep    int
	VehiclePoll   time.Duration
	MaxVehicleAge time.Duration
	StaticRefresh time.Duration
}

// Load builds the configuration. Real environment variables win; a .env file in the
// working directory (server/ when run from there) only fills in what is missing.
func Load() (Config, error) {
	loadDotEnv(".env")

	cfg := Config{
		APIKey:      os.Getenv("TRANZY_API_KEY"),
		BaseURL:     envOr("TRANZY_BASE_URL", "https://api.tranzy.ai/v1/opendata"),
		AgencyID:    envOr("TRANZY_AGENCY_ID", "4"), // 4 = RTEC & PUA Chisinau
		Addr:        ":" + envOr("PORT", "8080"),
		CORSOrigin:  os.Getenv("CORS_ORIGIN"),
		GeocoderURL: envOr("GEOCODER_URL", "https://nominatim.openstreetmap.org"),
		// Nominatim's usage policy asks for an identifying User-Agent.
		GeocoderAgent: envOr("GEOCODER_USER_AGENT", "droommd-transit/0.1 (+https://github.com/TimurCravtov/DroomMDBot)"),
		// OSRM-compatible pedestrian router; "off" keeps straight-line walking legs.
		WalkingURL:    envOr("WALKING_ROUTER_URL", "https://routing.openstreetmap.de/routed-foot"),
		DBPath:        envOr("DB_PATH", "data/droommd.db"),
		BotToken:      os.Getenv("TELEGRAM_BOT_TOKEN"),
		AllowAnon:     os.Getenv("AUTH_ALLOW_ANON") == "true",
		AuthMaxAge:    24 * time.Hour,
		BackupEvery:   24 * time.Hour,
		BackupKeep:    7,
		VehiclePoll:   5 * time.Second,
		MaxVehicleAge: 5 * time.Minute,
		StaticRefresh: 6 * time.Hour,
	}
	// Backups sit next to the database, so they land in the same persistent volume.
	cfg.BackupDir = envOr("BACKUP_DIR", filepath.Join(filepath.Dir(cfg.DBPath), "backups"))
	if v := os.Getenv("BACKUP_EVERY"); v == "0" || v == "off" {
		cfg.BackupEvery = 0
	} else if v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			return cfg, fmt.Errorf("BACKUP_EVERY: %q is not a positive duration (or \"off\")", v)
		}
		cfg.BackupEvery = d
	}
	if v := os.Getenv("BACKUP_KEEP"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return cfg, fmt.Errorf("BACKUP_KEEP: %q is not a positive number", v)
		}
		cfg.BackupKeep = n
	}
	if cfg.APIKey == "" {
		return cfg, errors.New("TRANZY_API_KEY is not set (put it in .env or the environment)")
	}

	for name, dst := range map[string]*time.Duration{
		"VEHICLE_POLL":    &cfg.VehiclePoll,
		"MAX_VEHICLE_AGE": &cfg.MaxVehicleAge,
		"STATIC_REFRESH":  &cfg.StaticRefresh,
		"AUTH_MAX_AGE":    &cfg.AuthMaxAge,
	} {
		if v := os.Getenv(name); v != "" {
			d, err := time.ParseDuration(v)
			if err != nil || d <= 0 {
				return cfg, fmt.Errorf("%s: %q is not a positive duration", name, v)
			}
			*dst = d
		}
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadDotEnv(paths ...string) {
	for _, path := range paths {
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			key, value, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			key = strings.TrimSpace(key)
			value = strings.Trim(strings.TrimSpace(value), `"'`)
			if _, set := os.LookupEnv(key); !set {
				os.Setenv(key, value)
			}
		}
		f.Close()
	}
}
