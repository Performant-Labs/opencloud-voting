# Architecture — Feature Voting for OpenCloud

## Status

**Active** — March 2026

---

## Context

This project provides a feature voting board as an OpenCloud Web extension
("web-app-feature-voting"). Users can submit feature requests, vote for ideas
they support, and delete their own submissions.

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

### Option A — OpenCloud-native storage (WebDAV) ✅ Chosen

Store all voting data as **JSON files inside an OpenCloud Space** using the
platform's existing WebDAV API. The web extension reads and writes these files
directly through the authenticated user session — no additional containers, no
proxy configuration, no Docker changes.

| Dimension | Assessment |
|-----------|------------|
| **Infrastructure** | Zero additional containers. Zero proxy config. Works anywhere OpenCloud runs. |
| **Authentication** | Inherits the user's OIDC session automatically — no separate auth flow. |
| **Scalability (features)** | Adding 10 more extensions means 10 more web apps, _not_ 10 more containers. |
| **Data model** | Simple key-value / JSON documents. No SQL, no joins, no transactions. |
| **Concurrency** | Risk of lost writes if two users edit the same file simultaneously. Acceptable for a voting board where write frequency is low. Mitigated with ETags. |
| **Deployment** | Copy the `dist/` folder to OpenCloud's apps directory. That's it. |

#### Data layout

```
/Spaces/voting-data/                        ← application-owned Space (or folder)
├── features.json                           ← array of all feature requests
├── votes/
│   ├── <feature-id>.json                   ← set of user IDs who voted
│   └── ...
```

An alternative flat layout using one file per feature was considered, but a
single `features.json` with a `votes` sub-directory balances read efficiency
(one GET to list everything) with write isolation (voting only touches the
individual vote file, not the master list).

#### API surface (in-browser only)

The web extension composable (`useVotingApi`) will use the `@opencloud-eu/web-client`
WebDAV helpers and `fetch()` against `/remote.php/dav/spaces/...` endpoints:

| Operation | WebDAV method | Path |
|-----------|---------------|------|
| List features | `GET` | `/features.json` |
| Create feature | `GET` + merge + `PUT` | `/features.json` (read-modify-write with ETag) |
| Delete feature | `GET` + filter + `PUT` | `/features.json` (read-modify-write with ETag) |
| Toggle vote | `GET` + toggle + `PUT` | `/votes/<feature-id>.json` |

ETag-based optimistic concurrency prevents silent overwrites.

---

### Option B — Sidecar API container (Hono + SQLite) ❌ Rejected

Run a separate Docker container (`voting-api`) alongside OpenCloud. The
container exposes a REST API backed by SQLite. The OpenCloud proxy routes
`/api/voting/*` requests to the sidecar.

This was the **original architecture** implemented in Phases 1–4 of
[docs/PLAN.md](PLAN.md).

| Dimension | Assessment |
|-----------|------------|
| **Infrastructure** | Requires its own Docker container, port, healthcheck, volume mount. |
| **Authentication** | Requires `proxy.yaml` configuration to forward OIDC tokens via `X-Access-Token`. API must decode/verify JWTs independently. |
| **Scalability (features)** | Each new feature with custom persistence = another container or a monolith API that grows indefinitely. |
| **Data model** | Full SQL (SQLite) with ACID transactions. Overkill for a voting board. |
| **Deployment** | Docker image build + `proxy.yaml` route + compose override + container restart. |

#### Why it was rejected

1. **Operational overhead.** The proxy routing alone consumed 30+ minutes of
   debugging in the development environment (config file layering,
   `service` vs `backend` field confusion, stale Docker image builds, port
   mapping through Traefik). Production deployment would inherit this
   complexity.

2. **Does not scale to multiple extensions.** If the project adds 10 more
   custom features (polls, announcements, feedback forms), the sidecar
   approach demands either 10 containers or a monolith API. Neither is
   desirable.

3. **OpenCloud's proxy is not designed for arbitrary backends.** While the
   `backend` field exists in the `Route` struct, the proxy documentation and
   examples focus on internal microservice routing (`service` field). The
   Radicale CalDAV integration is the only known external-backend example, and
   it required `additional_headers` and `remote_user_header` workarounds.

4. **Unnecessary for the data model.** Feature voting is a simple CRUD
   application. The data fits comfortably in JSON files. SQL transactions and
   relational joins add no value here.

---

## Decision

**Use Option A — OpenCloud-native WebDAV storage.**

The voting data will be stored as JSON files in an OpenCloud Space. The web
extension will read and write these files using the authenticated user's
WebDAV session. No additional containers, no proxy configuration, no Docker
changes.

## Consequences

### What we gain

- **Zero-container deployment.** The voting extension is a static JS bundle
  copied into OpenCloud's apps directory. Nothing else to run.
- **Automatic auth.** The user's OIDC session carries through to WebDAV
  requests. No token forwarding, no middleware, no JWT decoding.
- **Future-proof.** Additional extensions follow the same pattern — just add
  another web app. No infra changes per feature.

### What we give up

- **No SQL.** Sorting and filtering happen in-memory in the browser. For the
  expected data volume (hundreds of feature requests, not millions), this is
  acceptable.
- **No server-side validation.** Input sanitization moves to the client
  (defense-in-depth is reduced). Malicious users with direct WebDAV access
  could write arbitrary JSON. Mitigated by the fact that only authenticated
  OpenCloud users have access, and the app validates on read.
- **Optimistic concurrency only.** Two users submitting at the exact same
  millisecond could cause a lost write. ETags prevent silent overwrites; the
  UI retries on conflict.

### What we remove

The following code from the sidecar architecture will be deleted:

- `api/` — entire Node.js API sidecar (Hono, SQLite, auth middleware, routes, tests)
- `config/proxy.yaml` — OpenCloud proxy routing config
- `docker-compose.yml` — standalone compose (replaced by simple app install)
- `docker-compose.voting.yml` in `pl-opencloud-server` — compose override
- `.env` changes in `pl-opencloud-server` — `PROXY_ENABLE_BASIC_AUTH`, `DEMO_USERS`

### What stays

- `web/` — Vue.js web extension (refactored to use WebDAV instead of fetch)
- `docs/` — project documentation
- `Makefile` — simplified (no API targets)
- `README.md` — updated

---

## References

- [OpenCloud Proxy Service — Source](https://github.com/opencloud-eu/opencloud/blob/main/services/proxy/pkg/config/config.go) — `Route` struct with `Backend` and `Service` fields
- [OpenCloud Web Extension SDK](https://www.npmjs.com/package/@opencloud-eu/extension-sdk) — `defineWebApplication`, app registration
- [`@opencloud-eu/web-client`](https://www.npmjs.com/package/@opencloud-eu/web-client) — WebDAV client abstraction
- [OpenCloud WebDAV API](https://docs.opencloud.eu/docs/user/) — `PUT`, `GET`, `PROPFIND` on `/remote.php/dav/spaces/`
- [Radicale proxy example](https://github.com/opencloud-eu/opencloud-compose) — only known `backend` route in the compose repo
