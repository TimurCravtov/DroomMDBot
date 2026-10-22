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
| `CORS_ORIGIN` | empty | set to allow another origin; the Vite dev proxy doesn't need it |

## API

| Endpoint | Returns |
| --- | --- |
| `GET /api/routes` | all routes: `id`, `number`, `type`, `name`, `stopIds` |
| `GET /api/routes/{id}/shapes` | `{ paths: [[lng, lat], …][] }`, one path per direction |
| `GET /api/stops` | all stops |
| `GET /api/stops/{id}/arrivals` | estimated arrivals, soonest first |
| `GET /api/search?q=` | matching routes (number, name or type word) and stops |
| `GET /api/vehicles?routes=1,2` | current vehicles, optionally for some routes only |
| `GET /api/vehicles/stream?routes=1,2` | the same as server-sent events, one per refresh |
| `GET /healthz` | counts and the time of the last vehicle refresh |

Response shapes mirror `../client/src/api/types.ts`.

### Things to know

- The feed has no heading, so it is derived from consecutive positions (0 until a vehicle moves).
- Arrivals are estimates: there is no schedule, so they assume ~22 km/h along the route's
  shape, minus the age of the last GPS fix. Only vehicles that report their trip can be
  placed, which is roughly a third of them.
- Tranzy data is open under an attribute-and-share-alike condition; credit Tranzy in the UI.

## Layout

```
cmd/server/          entry point: wiring and graceful shutdown
internal/config/     environment and .env loading
internal/tranzy/     upstream API client and wire types
internal/transit/    domain model, static feed loading, search, arrival estimates
internal/fleet/      live vehicle polling, snapshot and subscriptions
internal/httpapi/    HTTP handlers, SSE, middleware
internal/geo/        distances, bearings, progress along a polyline
```

## Test

```sh
go vet ./... && go test ./...
```
