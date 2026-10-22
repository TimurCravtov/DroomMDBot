# syntax=docker/dockerfile:1

# ---- build ---------------------------------------------------------------
ARG GO_VERSION=1.26
FROM golang:${GO_VERSION}-alpine AS build
WORKDIR /src

# Dependencies first, so they are cached until go.mod / go.sum change.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# The SQLite driver is pure Go, so a static binary with no cgo is enough.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# The data directory, created here so a fresh volume inherits the right owner.
RUN mkdir /out-data

# ---- run -----------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/server /server
COPY --from=build --chown=65532:65532 /out-data /data

ENV PORT=8080 \
    DB_PATH=/data/droommd.db

# The SQLite database lives here; mount a volume to keep it.
VOLUME ["/data"]
EXPOSE 8080

# Docker (and Coolify) mark the container unhealthy if the server stops answering.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/server", "healthcheck"]

USER nonroot:nonroot
ENTRYPOINT ["/server"]
