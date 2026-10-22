# server

Go API that turns the [Tranzy](https://tranzy.ai/opendata/) open data feed for Chișinău
(RTEC & PUA: trolleybuses and buses) into the JSON the web client in `../client` expects.

It polls the upstream vehicle feed every few seconds and serves everything from memory, so
Tranzy sees one client no matter how many people watch the map.

## Run

```sh
cp ../.env.example ../.env   # then put your key in TRANZY_API_KEY
go run ./cmd/server
```

Get a free key at <https://apps.tranzy.ai/accounts>. Settings come from the environment, or
from `.env` in this directory or the repository root (real environment variables win).

| Variable | Default | Meaning |
| --- | --- | --- |
| `TRANZY_API_KEY` | required | Tranzy API key |
| `TRANZY_AGENCY_ID` | `4` | `4` is RTEC & PUA Chișinău |
| `TRANZY_BASE_URL` | `https://api.tranzy.ai/v1/opendata` | |
| `PORT` | `8080` | |
| `VEHICLE_POLL` | `5s` | how often vehicles are fetched |
| `MAX_VEHICLE_AGE` | `5m` | vehicles with an older GPS fix are dropped |
| `STATIC_REFRESH` | `6h` | how often routes, stops and shapes are reloaded |
| `GEOCODER_URL` | `https://nominatim.openstreetmap.org` | any Nominatim-compatible service |
| `GEOCODER_USER_AGENT` | `droommd-transit/…` | Nominatim's policy requires an identifying agent |
| `WALKING_ROUTER_URL` | `https://routing.openstreetmap.de/routed-foot` | OSRM-compatible pedestrian router; `off` keeps straight walking legs |
| `TELEGRAM_BOT_TOKEN` | empty | verifies Telegram Mini App sign-in (`initData`) |
| `AUTH_ALLOW_ANON` | `false` | `true` lets plain browsers use anonymous accounts, for testing |
| `AUTH_MAX_AGE` | `24h` | how old Telegram launch data may be |
| `DB_PATH` | `data/droommd.db` | SQLite database file (`/data/droommd.db` in Docker) |
| `BACKUP_EVERY` | `24h` | database snapshot interval; `off` disables |
| `BACKUP_KEEP` | `7` | how many snapshots to keep, in `<DB_PATH dir>/backups` |
| `CORS_ORIGIN` | empty | set to allow another origin; the Vite dev proxy doesn't need it |

## API

| Endpoint | Returns |
| --- | --- |
| `GET /api/routes` | all routes: `id`, `number`, `type`, `name`, `stopIds` |
| `GET /api/routes/{id}/shapes` | `{ paths: [[lng, lat], …][] }`, one path per direction |
| `GET /api/stops` | all stops |
| `GET /api/stops/{id}/arrivals` | estimated arrivals, soonest first |
| `GET /api/search?q=` | matching routes (number, name or type word) and stops |
| `GET /api/geocode?q=` | places and addresses (Nominatim), e.g. `sos hancesti 60/1` |
| `GET /api/plan?from=lat,lng&to=lat,lng` | up to four itineraries (walk + ride legs), fastest first |
| `GET /api/vehicles?routes=1,2` | current vehicles, optionally for some routes only |
| `GET /api/vehicles/stream?routes=1,2` | the same as server-sent events, one per refresh |
| `GET /api/me/places` | the caller's saved places (needs sign-in, see below) |
| `POST /api/me/places` | save a place: `{kind, label, lat, lng, address?, icon?}` (home/work replace the old one) |
| `DELETE /api/me/places/{id}` | delete one of the caller's places |
| `DELETE /api/me` | erase the caller's account and all their data |
| `GET /healthz` | counts and the time of the last vehicle refresh |

Response shapes mirror `../client/src/api/types.ts`.

### Signing in

`/api/me/*` identifies the caller by the `Authorization` header:

- `tma <initData>`: a Telegram Mini App. The signed launch data is verified with the bot
  token (HMAC-SHA256) and must be younger than `AUTH_MAX_AGE`; the user is `tg:<id>`.
- `anon <token>`: a browser's random 32+ character token, honoured only when
  `AUTH_ALLOW_ANON=true`; the user is `anon:<hash of the token>`. Anonymous ids can never
  collide with Telegram ones.

Everything else (`/api/routes`, `/api/vehicles`, …) is public.

### Storage

Saved places live in SQLite (pure-Go driver, no cgo, so the binary is static). One home and
one work place per user, at most 50 places each. The server snapshots the database
daily with `VACUUM INTO`, keeping the newest 7. See `../deploy/README.md` for volumes,
off-machine copies and restoring.

### Things to know

- The feed has no heading, so it is derived from consecutive positions (0 until a vehicle moves).
- Arrivals are estimates: there is no schedule, so they assume ~22 km/h along the route's
  shape, minus the age of the last GPS fix. Only vehicles that report their trip can be
  placed, which is roughly a third of them.
- Journey planning has no timetable to work from. It walks at 4.5 km/h (×1.25 for street detours),
  rides at ~22 km/h along the route's shape, and waits for the next vehicle using the live
  arrival estimates when one is known (5 minutes otherwise). It finds direct trips and trips
  with one transfer, walking up to 800 m to a stop and 300 m between stops.
- Walking legs follow real streets via FOSSGIS's pedestrian router (cached, a few requests at a
  time, 4 s budget per plan). If it is slow or down, those legs stay straight lines.
- Geocoding goes through Nominatim's public instance, which asks for at most one request per
  second: the server queues and caches lookups. Run your own instance for heavy use.
- Tranzy data is open under an attribute-and-share-alike condition; credit Tranzy in the UI.

## Layout

```
cmd/server/          entry point: wiring and graceful shutdown
internal/config/     environment and .env loading
internal/auth/       Telegram initData verification, anonymous tokens, middleware
internal/store/      SQLite persistence of saved places, backups
internal/tranzy/     upstream API client and wire types
internal/geocode/    Nominatim client with caching and rate limiting
internal/walking/    pedestrian router client (street-following walking paths)
internal/transit/    domain model, static feed loading, search, arrivals, journey planner
internal/fleet/      live vehicle polling, snapshot and subscriptions
internal/httpapi/    HTTP handlers, SSE, middleware
internal/geo/        distances, bearings, progress along a polyline
```

## Docker

```sh
docker compose up -d --build     # from the repository root; data in the droommd-data volume
```

The `Dockerfile` builds a static binary into a distroless image that runs as a non-root user
with `/data` as its volume. For Coolify see `../deploy/README.md`.

## Test

```sh
go vet ./... && go test ./...
```
