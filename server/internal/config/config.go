// Package config reads the server's settings from the environment.
package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
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
	VehiclePoll   time.Duration
	MaxVehicleAge time.Duration
	StaticRefresh time.Duration
}

// Load builds the configuration. Real environment variables win; .env files
// (./.env, then ../.env) only fill in what is missing.
func Load() (Config, error) {
	loadDotEnv(".env", "../.env")

	cfg := Config{
		APIKey:      os.Getenv("TRANZY_API_KEY"),
		BaseURL:     envOr("TRANZY_BASE_URL", "https://api.tranzy.ai/v1/opendata"),
		AgencyID:    envOr("TRANZY_AGENCY_ID", "4"), // 4 = RTEC & PUA Chisinau
		Addr:        ":" + envOr("PORT", "8080"),
		CORSOrigin:  os.Getenv("CORS_ORIGIN"),
		GeocoderURL: envOr("GEOCODER_URL", "https://nominatim.openstreetmap.org"),
		// Nominatim's usage policy asks for an identifying User-Agent.
		GeocoderAgent: envOr("GEOCODER_USER_AGENT", "droommd-transit/0.1 (+https://github.com/TimurCravtov/DroomMDBot)"),
		VehiclePoll:   5 * time.Second,
		MaxVehicleAge: 5 * time.Minute,
		StaticRefresh: 6 * time.Hour,
	}
	if cfg.APIKey == "" {
		return cfg, errors.New("TRANZY_API_KEY is not set (put it in .env or the environment)")
	}

	for name, dst := range map[string]*time.Duration{
		"VEHICLE_POLL":    &cfg.VehiclePoll,
		"MAX_VEHICLE_AGE": &cfg.MaxVehicleAge,
		"STATIC_REFRESH":  &cfg.StaticRefresh,
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
