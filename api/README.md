# OpenCloud Feature Voting — Go API

The Go backend for the OpenCloud Feature Voting extension. Runs as a sidecar container alongside the OpenCloud server.

## Prerequisites

- Go 1.22+ (`go version`)
- GCC (required for SQLite CGO bindings)

## Running Tests

All commands must be run from this directory (`api/`):

```bash
cd /path/to/opencloud-voting/api

# Unit tests only (fast, ~0.3s)
go test ./...

# Include integration tests (full handler + real SQLite)
go test -tags=integration ./...

# Verbose output with each test name
go test -v -tags=integration ./...

# Fresh run — bypass cache
go test -v -count=1 -tags=integration ./...

# Coverage report
go test -tags=integration -cover ./...
```

## Building

```bash
# Local build
go build -o voting-app .

# Docker build (from project root)
docker build -t voting-app -f api/Dockerfile api/
```

## Project Structure

```
api/
├── main.go               # HTTP server, DB init, graceful shutdown
├── main_test.go           # Unit tests: schema, WAL, health probes
├── models.go              # Domain structs (Feature, Vote, ErrorResponse)
├── store.go               # Database operations (context-aware, error-wrapped)
├── handlers.go            # HTTP handlers (510–540)
├── handlers_test.go       # Integration tests (build tag: integration)
├── metrics.go             # Prometheus-compatible metrics
├── middleware/
│   ├── auth.go            # OpenID Connect (OIDC) JWT validation
│   ├── auth_test.go       # Auth + rate limiter unit tests
│   └── rate_limit.go      # Per-user token bucket rate limiter
├── go.mod
├── go.sum
└── Dockerfile
```
