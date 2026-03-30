# Development Guide

This document covers how to set up the development environment, navigate the codebase, run tests, and understand code conventions.

---

## Project Structure

```
opencloud-voting/
├── api/                        # Go sidecar (REST API + SQLite)
│   ├── main.go                 # Entry point, router, server setup
│   ├── handlers.go             # HTTP request handlers
│   ├── store.go                # SQLite queries (features, votes, comments)
│   ├── models.go               # Shared data types
│   ├── metrics.go              # Prometheus metrics
│   ├── middleware/             # OIDCAuth + RateLimiter middleware
│   ├── handlers_test.go        # Handler unit tests
│   ├── main_test.go            # Integration-style API tests
│   ├── go.mod / go.sum
│   └── Dockerfile
│
├── web/                        # Vue 3 web extension
│   ├── src/
│   │   ├── App.vue             # Board view (feature list, voting, comments)
│   │   ├── NewFeature.vue      # Feature submission form
│   │   ├── components/         # Breadcrumbs and other shared components
│   │   ├── composables/        # useVotingApi (all API calls)
│   │   ├── types.ts            # Shared TypeScript types
│   │   └── index.ts            # Extension entry point
│   ├── tests/
│   │   ├── e2e/                # Playwright E2E suite (18 tests across 4 specs)
│   │   │   ├── comments.spec.ts
│   │   │   ├── smoke.spec.ts
│   │   │   ├── vote-targeting.spec.ts
│   │   │   └── voting.spec.ts
│   │   └── unit/               # Vitest unit tests
│   ├── playwright.config.ts
│   ├── vite.config.ts
│   └── package.json
│
├── install/                    # Release packaging artifacts
│   ├── docker-compose.override.yml   # Method A install file
│   ├── opencloud.yml                 # Method B install file
│   └── install.sh                    # One-liner install script
│
├── docs/                       # Project documentation
│   ├── ARCHITECTURE.md         # Architecture decision record
│   ├── DEVELOPMENT.md          # This file
│   ├── MAINTAINER_INSTRUCTIONS.md   # Release and maintenance procedures
│   ├── TESTING_INSTRUCTIONS.md # E2E test harness setup
│   ├── THEMING.md              # Design token and CSS conventions
│   ├── INTERNATIONALIZE.md     # i18n strategy
│   ├── SECURITY_ASSESSMENT.md  # Pen test results
│   ├── PRIVACY_ASSESSMENT.md   # Privacy review
│   ├── EXECUTION_LOG.md        # Phased development log
│   ├── PLAN.md                 # Original project plan
│   ├── load-test-results/      # Raw hey output from load tests
│   └── ai_guidance/            # Conventions and guidance for AI-assisted development
│
├── scripts/                    # Developer utility scripts
│   ├── load-test.sh            # hey-based load test suite
│   └── get-admin-token.ts      # Headless Playwright token extractor
│
├── config/
│   └── proxy.yaml              # OpenCloud proxy route (for local dev)
│
├── CHANGELOG.md                # Release history
├── CONTRIBUTING.md             # Contributor guide
├── INSTALLATION.md             # End-user installation guide
├── LICENSE                     # AGPL-3.0
├── README.md                   # Project overview
├── SECURITY.md                 # Security policy and vulnerability reporting
├── Makefile                    # All build/test/release commands
└── opencloud-voting.code-workspace
```

---

## Prerequisites

| Tool | Version | Purpose |
|:-----|:--------|:--------|
| Node.js | 22+ | Frontend build |
| pnpm | 10+ | Frontend package manager |
| Go | 1.22+ | API build and tests |
| Docker + Compose v2 | Any recent | Running the full stack |
| `hey` | Any | Load testing |

Install `hey`:
```bash
brew install hey
```

---

## Local Development Setup

### 1. Start the OpenCloud stack

```bash
cd ~/Sites/opencloud
docker compose up -d
```

OpenCloud will be available at `https://cloud.opencloud.test`.

### 2. Install frontend dependencies

```bash
cd web
pnpm install
```

### 3. Build and deploy the frontend

```bash
# Single build + deploy to the local OC instance
make deploy

# Or watch mode (rebuilds on file save, but requires manual deploy)
make dev
```

`make deploy` builds `web/dist/` and copies it to
`~/Sites/opencloud/config/opencloud/apps/feature-voting/`, then
restarts the `opencloud` container to pick up the new assets.

### 4. Start the API sidecar

The sidecar is defined in `opencloud/docker-compose.yml` and builds
from `../opencloud-voting/api`:

```bash
cd ~/Sites/opencloud
docker compose up -d --build voting-app
```

---

## Available Make Targets

```
make install        Install frontend (pnpm) dependencies
make build          Production frontend build
make dev            Frontend watch mode (no deploy)
make deploy         Build + deploy to local OpenCloud + restart container
make build-api      Compile Go API binary locally
make build-image    Build Docker image (tagged :VERSION + :latest)
make test           Frontend unit tests (Vitest)
make test-e2e       Playwright E2E suite (requires live cloud.opencloud.test)
make test-go        Go unit tests
make lint           ESLint on frontend
make check-types    TypeScript type check
make format         Prettier format write
make clean          Remove web/dist, node_modules, api binary, dist/
make release        Package release assets → dist/
make publish        Full publish: release + build-image + GitHub Release + GHCR push
make release-all    Alias for publish (one-shot)
```

---

## Testing

### Frontend unit tests

```bash
make test
# or: cd web && pnpm test:unit
```

### Go unit tests

```bash
make test-go
# or: cd api && go test ./...
```

### Playwright E2E tests

Requires the full `cloud.opencloud.test` stack to be running with the voting
extension deployed and the sidecar running.

```bash
make test-e2e
# or: cd web && npx playwright test --reporter=list
```

The suite has 18 tests across 4 spec files. See `docs/TESTING_INSTRUCTIONS.md`
for the full harness setup including user provisioning.

### Load tests

```bash
bash scripts/load-test.sh
```

Runs two profiles via `hey` against the live API:
- **Threshold**: 500 requests, 50 concurrent
- **Spike**: 5,000 requests, 200 concurrent

Requires a valid Bearer token in `scripts/admin-token.txt` (extracted
automatically by the script via headless Playwright).

---

## Code Conventions

### Go API

- No third-party framework — stdlib `net/http` only
- All DB access through `store.go` functions; no raw SQL in handlers
- Middleware in `api/middleware/` as standalone files
- All handler errors return `{"error_code": "...", "message": "..."}` JSON

### Vue frontend

- Single composable `useVotingApi` for all API calls — no direct `fetch` in components
- Validation errors rendered as `role="alert"` banners (accessibility)
- Use `{{ }}` text interpolation only — never `v-html`
- Date text must use color `#767676` or darker (WCAG AA 4.5:1 contrast)
