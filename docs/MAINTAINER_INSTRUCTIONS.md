# Maintainer Instructions

This document covers release operations and ongoing maintenance tasks for the Feature Voting extension. For development setup and code conventions, see [`docs/DEVELOPMENT.md`](DEVELOPMENT.md).

---

## Release Prerequisites

1. **`gh` CLI authenticated**:
   ```bash
   gh auth login
   ```
2. **Docker logged in to GHCR**:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
   ```
3. **Working tree clean** — commit or stash everything before releasing
4. **All tests passing**:
   ```bash
   make test && make test-go
   ```

---

## Cutting a Release

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
   - Runs `gh release create v0.1.0 --generate-notes` and uploads all 4 assets
   - Pushes both the versioned and `:latest` image tags to GHCR
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
| `feature-voting-web-vX.Y.Z.zip` | Built frontend assets (unzip into OC apps dir) |
| `docker-compose.override.yml` | Method A install file |
| `opencloud.yml` | Method B install file (COMPOSE_FILE pattern) |
| `install.sh` | One-liner install script |

The Docker image lives at `ghcr.io/performant-labs/opencloud-voting-api` on GitHub Container Registry — no Docker Hub account needed.

---

## Partial Release Operations

**Assets only** (no GitHub Release, no Docker push):
```bash
make release VERSION=v0.1.0
# Files land in dist/ — upload manually via gh or the GitHub web UI
```

**Image only**:
```bash
make build-image VERSION=v0.1.0
docker push ghcr.io/performant-labs/opencloud-voting-api:v0.1.0
docker push ghcr.io/performant-labs/opencloud-voting-api:latest
```

---

## Versioning

Use [semver](https://semver.org/): `vMAJOR.MINOR.PATCH`.

| Bump | When |
|:-----|:-----|
| Patch (`v0.1.1`) | Bug fixes, dependency updates, doc-only changes |
| Minor (`v0.2.0`) | New features, backwards-compatible API additions |
| Major (`v1.0.0`) | Breaking changes to the API shape or proxy route format |

---

## Dependency Maintenance

**Go dependencies** — update and verify no regressions:
```bash
cd api && go get -u ./... && go mod tidy && go test ./...
```

**Frontend dependencies**:
```bash
cd web && pnpm update && pnpm audit
```

**Docker base image** — the `Dockerfile` pins `golang:1.22-alpine` and
`alpine:3.21`. Check for newer patch releases periodically and update the
`FROM` lines, then verify `make build-image` still produces a working image.
