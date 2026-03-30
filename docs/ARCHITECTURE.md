# Architecture — Feature Voting for OpenCloud

## Status

**Active** — March 2026

> [!IMPORTANT]
> **Decision Superseded.** The original decision (Option A — WebDAV) was implemented in Phases 100–300, then **replaced in Phase 400** after security review. The current production architecture is **Option B — Go Sidecar** (see [Addendum](#addendum-phase-400-reversal-webdav-rejected-go-sidecar-adopted)).
> The original rationale is preserved below for historical reference.

---

## Context

This project provides a feature voting board as an OpenCloud Web extension
(`web-app-feature-voting`). Users can submit feature requests, vote for ideas
they support, comment on submissions, and delete their own contributions.

The core design question is: **Where does the voting data live?**

OpenCloud is a Go microservices platform. It does _not_ have a server-side
plugin system (no PHP modules, no Node hook points). The only official
extension surface is:

- **Web extensions** — Vue.js apps rendered inside the OpenCloud Web UI.
  These are purely frontend; they do not define new API endpoints.

Any server-side persistence therefore requires either (a) a separate service
with its own container, or (b) using OpenCloud's existing storage APIs.

---

## Options Considered

### Option A — OpenCloud-native storage (WebDAV) ~~✅ Originally Chosen~~ ❌ Superseded

Store all voting data as **JSON files inside an OpenCloud Space** using the
platform's existing WebDAV API. The web extension reads and writes these files
directly through the authenticated user session.

| Dimension | Assessment |
|:----------|:-----------|
| **Infrastructure** | Zero additional containers. Zero proxy config. |
| **Authentication** | Inherits the user's OIDC session automatically. |
| **Concurrency** | Race condition: two simultaneous votes on the same feature overwrite each other. ETags reduce the window but do not eliminate it. |
| **Authorization** | No server-side enforcement — any authenticated user can write arbitrary data to the WebDAV path, including other users' vote counts. |
| **Audit trail** | No. Any user can overwrite any other user's vote by writing directly to the WebDAV file. |

#### Why it was ultimately rejected (Phase 400)

See [Addendum](#addendum-phase-400-reversal-webdav-rejected-go-sidecar-adopted).

---

### Option B — Go Sidecar API container ✅ **Current Architecture**

Run a separate Docker container (`voting-app`) alongside OpenCloud. The
container exposes a REST API backed by SQLite. The OpenCloud proxy routes
`/api/voting/*` requests to the sidecar.

| Dimension | Assessment |
|:----------|:-----------|
| **Infrastructure** | One additional Docker container, one proxy route, one volume mount. |
| **Authentication** | Bearer token forwarded by proxy as `X-Access-Token`; sidecar verifies JWT signature and extracts `sub`, `email`, `preferred_username`. |
| **Authorization** | Server-side enforcement — users can only delete their own features; admins can delete any. Vote toggling is strictly per-user. |
| **Concurrency** | SQLite WAL mode enables concurrent reads. Writes are serialized by SQLite's write-ahead log — no race conditions on vote counts. |
| **Rate limiting** | Per-user token bucket (30 req/s, burst 60) prevents thundering-herd attacks without complex infrastructure. |
| **Data integrity** | ACID transactions. `COUNT(DISTINCT user_id)` prevents vote count inflation from query bugs. |
| **Deployment** | `docker compose up -d --build voting-app` + copy `dist/` frontend. |

---

## Addendum: Phase 400 Reversal — WebDAV Rejected, Go Sidecar Adopted

**Date:** March 2026  
**Decision:** Override Option A; implement Option B.

### Why WebDAV was rejected in Phase 400

After implementing the WebDAV approach (Phases 100–300), a security review
identified two critical, unmitigatable flaws:

#### 1. No server-side authorization enforcement

With WebDAV, the voting data is a JSON file stored in a user's personal
OpenCloud space. Any user with WebDAV access can issue a `PUT` request
directly to the file path and overwrite vote counts, delete other users'
features, or inflate/deflate any vote total — all without going through the
extension's UI logic.

The application has no way to validate that a write to the JSON file came
through the extension versus a direct `curl` call. Client-side validation is
not a security control.

#### 2. Concurrency race condition on vote counts

The WebDAV read-modify-write pattern for vote toggling has a TOCTOU race:

```
User A reads features.json  (vote_count: 5)
User B reads features.json  (vote_count: 5)
User A writes features.json (vote_count: 6)
User B writes features.json (vote_count: 6)  ← User A's vote is silently lost
```

ETag-based optimistic concurrency converts silent overwrites into errors, but
does not prevent vote loss — it just makes it visible to one of the two users.
Under any meaningful concurrent load, this degrades to a retry storm.

The Go sidecar eliminates this entirely: `INSERT OR REPLACE INTO votes` is
atomic, and `SELECT COUNT(DISTINCT user_id)` derives the vote count from the
authoritative record, never from a stale cached value.

### Why the Go sidecar aligns with upstream OpenCloud patterns

OpenCloud's own microservices (graph, gateway, store, eventhistory, etc.)
follow precisely this pattern:

- **Standalone Go binary** exposing HTTP endpoints
- **Registered with the proxy layer** via a route entry  
- **JWT Bearer token authentication** via shared OIDC issuer
- **SQLite or PostgreSQL** for persistence depending on scale tier

The `voting-app` sidecar is architecturally identical to OpenCloud's own
`store` service — a small, focused Go HTTP server with SQLite storage,
registered at a dedicated proxy route. This means the extension is
ready for upstream contribution into the OpenCloud microservices monorepo
without architectural refactoring.

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ┌───────────────────────────────┐                      │
│  │  feature-voting Vue extension │                      │
│  │  useVotingApi composable      │                      │
│  └──────────┬────────────────────┘                      │
│             │ Bearer token (OIDC)                       │
└─────────────│───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  OpenCloud Proxy                                        │
│  Route: /api/voting/* → voting-app:8080                 │
│  Injects: X-Access-Token header                         │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│  voting-app (Go, stdlib net/http)                       │
│  ├── OIDCAuth middleware     JWT verify + sub extract   │
│  ├── RateLimiter middleware  30 req/s, burst 60/user    │
│  ├── Feature CRUD            POST/GET/DELETE /features  │
│  ├── Vote toggle             POST /features/{id}/vote   │
│  ├── Comments                POST/DELETE /comments      │
│  ├── Observability           /healthz /readyz /metrics  │
│  └── SQLite WAL              /data/feature-voting.sqlite│
└─────────────────────────────────────────────────────────┘
```

### Key implementation decisions

| Decision | Rationale |
|:---------|:----------|
| `modernc.org/sqlite` (pure Go) | No CGO dependency — cross-compiles cleanly for Alpine Docker images without a C toolchain |
| SQLite WAL mode | Allows concurrent reads while serializing writes; eliminates `database is locked` errors under load |
| `net/http` stdlib only | Avoids framework lock-in; aligns with OpenCloud's own internal services which use chi or stdlib |
| Per-user token bucket rate limiter | Prevents a single aggressive client from exhausting the vote endpoint without complex infra (no Redis, no distributed state) |
| `COUNT(DISTINCT user_id)` derivation | Vote counts are always derived from the canonical `votes` table, never stored as a denormalised counter — prevents inflation from race conditions or bugs |
| Auto-vote on feature creation | Matches common feature-voting UX conventions; the creator is the first voter |

---

## Concurrency Verification

Load test results from Phase 1000 (March 2026):

| Test | Configuration | P95 Latency | Error Rate |
|:-----|:--------------|:------------|:-----------|
| Threshold | 500 req, 50 concurrent | **41.7ms** | 0% |
| Spike | 5,000 req, 200 concurrent | **77.3ms** | 0% |

Zero `database is locked` errors under either load profile. The per-user rate
limiter (burst=60) serves as the admission control layer — requests beyond the
burst are rejected with `429 Too Many Requests` before they reach the SQLite
write path. See `docs/load-test-results/` for raw `hey` output.

---

## References

- [OpenCloud Proxy Service](https://github.com/opencloud-eu/opencloud/blob/main/services/proxy/pkg/config/config.go) — `Route` struct
- [OpenCloud Web Extension SDK](https://www.npmjs.com/package/@opencloud-eu/extension-sdk) — `defineWebApplication`
- [`modernc.org/sqlite`](https://pkg.go.dev/modernc.org/sqlite) — pure Go SQLite driver
- [`golang-jwt/jwt`](https://github.com/golang-jwt/jwt) — JWT verification
- [SQLite WAL mode](https://www.sqlite.org/wal.html) — write-ahead logging
- [OpenCloud Compose](https://github.com/opencloud-eu/opencloud-compose) — reference deployment
