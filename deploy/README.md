# Deploying on Coolify

Two Coolify resources from this repository: the **server** (Go + SQLite, built from
`server/Dockerfile`) and the **client** (static site, which you already have). Coolify
provides the reverse proxy, HTTPS certificates and volume management, so nothing else is
needed on the VPS.

The examples use `app.example.com` for the client and `api.example.com` for the server.

## 1. The server

**New resource → repository → this repo, branch `main`.**

| Setting | Value |
| --- | --- |
| Build pack | **Dockerfile** |
| Base directory | `/server` |
| Dockerfile location | `/Dockerfile` |
| Ports exposes | `8080` |
| Domain | `https://api.example.com` |

**Persistent storage** (this is what keeps the database): add a volume with destination
path **`/data`**. The image creates `/data` owned by the unprivileged user the server runs
as, and a fresh Coolify volume inherits that, so no permission setup is needed.

> If you mount a *host directory* instead of a named volume, make it writable by uid
> `65532` (`chown 65532:65532 <dir>`), or the server can't create the database.

**Environment variables** (runtime):

| Variable | Value |
| --- | --- |
| `TRANZY_API_KEY` | your Tranzy key (required) |
| `TELEGRAM_BOT_TOKEN` | the bot token; used to verify who is calling (required for Telegram sign-in) |
| `CORS_ORIGIN` | `https://app.example.com` — the client's origin (comma-separate several) |
| `AUTH_ALLOW_ANON` | `false` in production; `true` while you test from a plain browser (see below) |
| `DB_PATH` | leave unset (defaults to `/data/droommd.db`) |

Optional: `BACKUP_EVERY` (default `24h`, `off` to disable), `BACKUP_KEEP` (default `7`),
`GEOCODER_URL`, `WALKING_ROUTER_URL`. The full list is in `server/README.md`.

**Health check:** the image declares one (`/server healthcheck`), which Coolify honours. If
you prefer Coolify's own, enable it with path `/healthz` on port `8080`.

Deploy. `https://api.example.com/healthz` should answer `{"status":"ok","storage":"ok",…}`.

## 2. The client

The client reads the API address **when it is built**, so it must be a *build variable*.
On the client resource set, with **"Available at Buildtime"** ticked:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `https://api.example.com/api` |
| `VITE_CARTO_API_KEY` | your CARTO key (for the Light/Dark map styles) |

Then **redeploy** the client: changing a build variable has no effect until it is rebuilt.
Only `VITE_`-prefixed variables reach the browser, so never put secrets in them.

> **One domain instead?** You can route the server at `https://app.example.com/api` (a
> path on the client's domain) and set `VITE_API_URL=/api`; then no CORS is needed.
> Check that the server receives paths starting with `/api/` (Coolify doesn't strip the
> prefix by default, which is what the server expects).

## 3. Telegram

Telegram Mini Apps must be served over HTTPS, which Coolify already does.

1. In [@BotFather](https://t.me/BotFather): **/mybots → your bot → Bot Settings → Menu Button
   → Configure menu button**, and give it `https://app.example.com`. (Or **/newapp** for a
   direct link `t.me/yourbot/app`.)
2. Open the bot in Telegram and tap the menu button. Home, work and other saved places are
   now stored per Telegram account, verified server-side.

## Testing in a plain browser

Outside Telegram there is no signed launch data, so the app uses an **anonymous account**: a
random token it keeps in the browser's localStorage, which the server treats as a user of its
own. The server accepts this only when `AUTH_ALLOW_ANON=true`.

- **Locally:** `AUTH_ALLOW_ANON=true` is already in `server/.env`. Run `go run ./cmd/server` in
  `server/` and `npm run dev` in `client/`, and saved places persist in `server/data/`.
- **Against the VPS:** set `AUTH_ALLOW_ANON=true` on the server resource while testing, then
  turn it off. To point your local client at the deployed server, put
  `DEV_API_TARGET=https://api.example.com` in `client/.env` (the Vite dev server proxies to
  it, so CORS isn't involved).
- Without it enabled, a browser that can't sign in still works: saved places fall back to
  that browser's localStorage.

Clearing the browser's site data discards the anonymous token, and with it access to that
anonymous account's places.

## Backups

The server backs up its own database: every `BACKUP_EVERY` (24 h) it writes a consistent
snapshot to `/data/backups/droommd-YYYYMMDD-HHMMSS.db` and keeps the newest `BACKUP_KEEP` (7).
That protects against mistakes and corruption, but it lives in the same volume, so it does
**not** survive losing the volume or the VPS. Copy it off the machine, for example from the
host's crontab (find the volume name with `docker volume ls | grep droommd`):

```sh
# nightly at 04:00: copy the backups to /root/droommd-backups
0 4 * * * docker run --rm -v <volume-name>:/data:ro -v /root/droommd-backups:/out alpine sh -c 'cp -n /data/backups/* /out/'
```

…and from there to S3, another server or your laptop with `rclone`/`rsync`.

**Restore:** stop the server resource in Coolify, then replace the database with a backup:

```sh
docker run --rm -v <volume-name>:/data -v /root/droommd-backups:/in alpine sh -c \
  'rm -f /data/droommd.db-wal /data/droommd.db-shm && cp /in/droommd-YYYYMMDD-HHMMSS.db /data/droommd.db && chown 65532:65532 /data/droommd.db'
```

and start it again.

## Privacy

Saved home and work places are personal data. The server stores only what the user saves
(label, coordinates, optional address and icon) under their Telegram id, never logs
coordinates, and `DELETE /api/me` erases an account and everything stored for it. Consider
adding a "delete my data" button or bot command that calls it.

## Rotate the bot token

The token in your local `server/.env` has been shared in a chat. Before launch, revoke and reissue
it in @BotFather (**/revoke**) and put the new one into Coolify's environment variables.
