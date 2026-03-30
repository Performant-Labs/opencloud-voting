# Developer Instructions

This document covers everything needed to work on Feature Voting — setting up the
development environment, running and writing tests, understanding the project layout,
and cutting releases.

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
│   │   ├── composables/        # useVotingApi (all API calls)
│   │   └── index.ts            # Extension entry point
│   ├── tests/
│   │   ├── e2e/smoke.spec.ts   # Playwright E2E suite (18 tests)
│   │   └── unit/               # Vitest unit tests
│   ├── playwright.config.ts
│   ├── vite.config.ts
│   └── package.json
│
├── install/                    # Release packaging artifacts
│   ├── docker-compose.override.yml   # Method A install file
│   ├── opencloud.yml                 # Method B install file
│   ├── install.sh                    # One-liner install script
│   └── INSTALL.md                    # Detailed install reference
│
├── docs/                       # Project documentation
│   ├── ARCHITECTURE.md         # Architecture decision record
│   ├── SECURITY_ASSESSMENT.md  # Live pen test results
│   ├── TESTING_INSTRUCTIONS.md # E2E test harness setup
│   ├── EXECUTION_LOG.md        # Phased development log
│   └── PLAN.md                 # Original project plan
│
├── scripts/                    # Developer utility scripts
│   ├── load-test.sh            # hey-based load test suite
│   └── get-admin-token.ts      # Headless Playwright token extractor
│
├── config/
│   └── proxy.yaml              # OpenCloud proxy route (for local dev)
│
├── INSTALLATION.md             # End-user installation guide
├── README.md                   # Project overview
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
| `gh` CLI | Any | Creating GitHub Releases |
| `hey` | Any | Load testing |

Install `gh`:
```bash
brew install gh
gh auth login
```

Install `hey`:
```bash
brew install hey
```

---

## Local Development Setup

### 1. Start the OpenCloud stack

```bash
cd ~/Sites/pl-opencloud-server
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
`~/Sites/pl-opencloud-server/config/opencloud/apps/feature-voting/`, then
restarts the `opencloud` container to pick up the new assets.

### 4. Start the API sidecar

The sidecar is defined in `pl-opencloud-server/docker-compose.yml` and builds
from `../opencloud-voting/api`:

```bash
cd ~/Sites/pl-opencloud-server
docker compose up -d --build voting-app
```

Or run directly for faster iteration (requires SQLite and a fake OIDC issuer,
not recommended for normal development — use Docker):

```bash
cd api && go run .
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

---

## Release Instructions

### Prerequisites

1. **`gh` CLI authenticated** — run `gh auth login` if not already done
2. **Docker logged in to GHCR**:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
   ```
3. **Working tree clean** — commit or stash everything before releasing
4. **All tests passing**:
   ```bash
   make test && make test-go
   ```

### Cutting a release

Everything is handled by a single Make target:

```bash
make release-all VERSION=v0.1.0
```

This runs, in order:

1. **`release`** — builds the frontend (`pnpm build`), zips `web/dist/` into
   `dist/feature-voting-web-v0.1.0.zip`, and copies
   `docker-compose.override.yml`, `opencloud.yml`, and `install.sh` into `dist/`

2. **`build-image`** — builds the Go sidecar Docker image tagged
   `ghcr.io/performant-labs/opencloud-voting-api:v0.1.0` and `:latest`

3. **`publish`**:
   - Creates and pushes the `v0.1.0` git tag (skips if it already exists)
   - Runs `gh release create v0.1.0` with `--generate-notes` (auto-generates
     release notes from commit messages since the last tag) and uploads all 4
     assets as release attachments
   - Runs `docker login ghcr.io` then pushes both the versioned and `:latest`
     image tags to GHCR
   - Prints the release URL and image ref on completion

After the command completes:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✓ Release v0.1.0 published:
   GitHub: https://github.com/Performant-Labs/opencloud-voting/releases/tag/v0.1.0
   Image:  ghcr.io/performant-labs/opencloud-voting-api:v0.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### What the GitHub Release contains

| File | Description |
|:-----|:------------|
| `feature-voting-web-v0.1.0.zip` | Built frontend assets (unzip into OC apps dir) |
| `docker-compose.override.yml` | Method A install file |
| `opencloud.yml` | Method B install file (COMPOSE_FILE pattern) |
| `install.sh` | One-liner install script |

The Docker image lives at `ghcr.io/performant-labs/opencloud-voting-api` on
GitHub Container Registry — no separate Docker Hub account needed.

### If you only want the assets (no publish)

```bash
make release VERSION=v0.1.0
# Files are in dist/ — upload manually via gh or the GitHub web UI
```

### If you only want the image

```bash
make build-image VERSION=v0.1.0
docker push ghcr.io/performant-labs/opencloud-voting-api:v0.1.0
docker push ghcr.io/performant-labs/opencloud-voting-api:latest
```

### Versioning

Use [semver](https://semver.org/): `vMAJOR.MINOR.PATCH`.

- Patch (`v0.1.1`): bug fixes, dependency bumps, doc-only changes
- Minor (`v0.2.0`): new features, backwards-compatible API changes
- Major (`v1.0.0`): breaking changes to the API or proxy route format
