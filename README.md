# Feature Voting — OpenCloud Web Extension

A feature voting board for OpenCloud. Users can submit feature requests, upvote ideas they want prioritized, comment on submissions, and delete their own contributions.

## Architecture

This application consists of two components:

1. **Vue.js Web Extension** — rendered inside the OpenCloud Web UI (`web/`)
2. **Go Sidecar API** — a lightweight REST API container that manages all persistent data (`api/`)

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ┌───────────────────────────────┐                      │
│  │  feature-voting extension     │                      │
│  │  (Vue 3 + TypeScript)         │                      │
│  │  useVotingApi composable      │                      │
│  └──────────┬────────────────────┘                      │
│             │ Bearer token (OIDC)                       │
└─────────────│───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  OpenCloud Proxy (Traefik / proxy service)              │
│  Route: /api/voting/* → voting-app:8080                 │
│  Auth:  validates Bearer token, injects X-Access-Token │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  Go Sidecar (voting-app container)                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  HTTP Router (net/http)                          │   │
│  │  ├── OIDCAuth middleware  (JWT verification)     │   │
│  │  ├── RateLimiter middleware (30 req/s, burst 60) │   │
│  │  ├── POST /features                              │   │
│  │  ├── GET  /features                              │   │
│  │  ├── DELETE /features/{id}                       │   │
│  │  ├── POST /features/{id}/vote                    │   │
│  │  ├── POST /features/{id}/comments                │   │
│  │  ├── DELETE /features/{id}/comments/{cid}        │   │
│  │  ├── GET  /healthz, /readyz, /metrics            │   │
│  │  └── SQLite DB (WAL mode, /data/feature-voting.sqlite)│
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture decision record, including why WebDAV was evaluated then rejected in favour of this Go sidecar pattern.

---

## Prerequisites

**For Running/Installation:**
- Docker + Docker Compose v2+
- A running [`opencloud`](https://github.com/opencloud-eu/opencloud) instance at `cloud.opencloud.test` for local testing

**For Building from Source:**
- Node.js 22+ & [pnpm](https://pnpm.io/installation) v10+
- Go 1.22+

---

## Installation

See **[INSTALLATION.md](INSTALLATION.md)** for full instructions, including:

- **Method A — COMPOSE_FILE Append** (recommended): upstream-aligned method matching OpenCloud conventions (Collabora, Radicale, etc.)
- **Method B — Override File**: drop a `docker-compose.override.yml` into your deployment directory

---

## Development

```bash
# Frontend watch mode
cd web && pnpm dev

# Go API (with hot reload via air, or manual)
cd api && go run .
```

---

## Commands

| Command | Description |
|:--------|:------------|
| `cd web && pnpm install` | Install frontend dependencies |
| `cd web && pnpm build` | Production frontend build |
| `cd web && pnpm test:unit` | Run frontend unit tests |
| `cd web && pnpm lint` | Lint frontend code |
| `cd api && go test ./...` | Run Go unit tests |
| `cd api && go build -o voting-app .` | Build Go binary |
| `ADMIN_PASSWORD=… npx playwright test` | Run E2E tests (requires live OpenCloud) |

---

## Data Model

All voting data is stored in a SQLite database (`/data/feature-voting.sqlite`) managed by the Go sidecar. The schema uses WAL mode for concurrent read performance.

**Tables:** `features`, `votes`, `comments`

```sql
features: id, title, description, created_by, vote_count, comment_count, created_at
votes:    feature_id, user_id, created_at
comments: id, feature_id, user_id, body, created_at
```

**REST API** (all endpoints require `Authorization: Bearer <token>`):

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/api/voting/features` | List all features (sorted by vote count) |
| `POST` | `/api/voting/features` | Create a feature (auto-votes for creator) |
| `DELETE` | `/api/voting/features/{id}` | Delete own feature (admin can delete any) |
| `POST` | `/api/voting/features/{id}/vote` | Toggle vote on/off |
| `GET` | `/api/voting/features/{id}/comments` | List comments |
| `POST` | `/api/voting/features/{id}/comments` | Post a comment |
| `DELETE` | `/api/voting/features/{id}/comments/{cid}` | Delete own comment |
| `GET` | `/api/voting/healthz` | Liveness probe |
| `GET` | `/api/voting/readyz` | Readiness probe |
| `GET` | `/api/voting/metrics` | Prometheus metrics |

---

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Frontend** | Vue 3, TypeScript, `@opencloud-eu/web-pkg` |
| **Build** | Vite |
| **API** | Go 1.22, `net/http` (stdlib only — no framework) |
| **Database** | SQLite (WAL mode) via `mattn/go-sqlite3` (CGO, statically linked against musl) |
| **Auth** | OIDC JWT verification via `coreos/go-oidc/v3` |
| **Testing** | Playwright E2E (19 tests), Go unit tests, `hey` load tests |

---

## Testing

### E2E Tests (Playwright)

Requires a live `cloud.opencloud.test` environment.

```bash
cd web
ADMIN_PASSWORD=YourAdminPassword npx playwright test
# 19 tests across 5 suites: comments, smoke, vote-targeting, voting, get-admin-token
```

> If your admin password is `admin` (the default), you can omit `ADMIN_PASSWORD`.

### Go Unit Tests

```bash
cd api
go test ./...
```

### Load Tests

```bash
bash scripts/load-test.sh
# Phase 1020: 500 req, 50 concurrent → P95=41.7ms
# Phase 1030: 5000 req, 200 concurrent → P95=77.3ms, zero database-locked errors
```

---

## License

AGPL-3.0
