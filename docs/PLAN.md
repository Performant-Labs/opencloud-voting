# Feature Voting App — Project Plan

## Overview

A feature voting board built as an OpenCloud Web extension with a SQLite-backed API sidecar.

## Architecture

- **Frontend** (`web/`): Vue 3 + TypeScript OpenCloud web extension (`@opencloud-eu/web-pkg`)
- **Backend** (`api/`): Hono + better-sqlite3 REST API sidecar

## AI Agent Instructions

> **When a command hangs, a process gets stuck, or a build/test times out:**
>
> 1. Consult [`docs/HANGING_PROCESSES.md`](HANGING_PROCESSES.md) for known causes and solutions.
> 2. If the issue matches an existing entry, follow the documented fix.
> 3. If it's a **new** type of hang not yet documented, add a new numbered entry to `HANGING_PROCESSES.md` following the established format (Symptom → Root Cause → Detection → Solution → Prevention).
> 4. Update the Quick Reference table at the top of the document.
>
> This is a living document. Every hang encountered is an opportunity to prevent future ones.

## Phase 1: Scaffolding ✅

- [x] Remove all Nextcloud PHP code (appinfo/, lib/, templates/, composer.*)
- [x] Scaffold API sidecar (`api/`) with Hono + SQLite
- [x] Scaffold OpenCloud web extension (`web/`) from web-app-skeleton pattern
- [x] Update root files (.gitignore, Makefile, README.md)

## Phase 2: Local Development Environment ✅

- [x] Verify `pnpm install` succeeds in both `api/` and `web/`
- [x] Verify `pnpm test` passes in `api/` (10/10)
- [x] Verify `pnpm build` succeeds in `web/` (152ms, 9.8kB)
- [x] Configure Docker Compose for standalone development
- [x] Integrate with `pl-opencloud-server` (`docker-compose.voting.yml`)

## Phase 3: Feature Completeness ✅

- [x] Verify API endpoint behavior — 12/12 tests passing (CRUD + vote + pagination)
- [x] Vue component renders correctly (builds successfully, 11.7kB)
- [x] Error handling: dismissible error banner, submitting state, disabled inputs, focus styles
- [x] Pagination: API supports limit/offset with total count, "Load More" button in UI

### Post-Phase 3 Audit (fixes applied)

Three issues found by auditing against official OpenCloud documentation:

1. **API URL mismatch** (fixed) — Routes now mount at `/features` instead of `/api/features`.
   The proxy maps `/api/voting/*` → `http://voting-api:3456/*`, stripping the prefix.
2. **`fetch()` won't carry auth token** (fixed) — Composable now accepts an `accessToken`
   callback and attaches it as `Authorization: Bearer <token>`. Raw `credentials: 'include'`
   alone doesn't work with OIDC token-based auth.
3. **Redundant `web/manifest.json`** (fixed) — Removed. The build generates `dist/manifest.json`
   with the correct hashed filename; source file was misleading.

## Phase 4: Authentication & Security ✅

> **Architecture note (discovered in research):**
> OpenCloud's **proxy service** is the auth gateway. It validates OIDC tokens
> before forwarding requests to backend services. Our API sidecar does NOT
> implement its own OIDC flow — instead, the proxy handles auth and passes
> identity to the sidecar via headers.

### 4a. Proxy routing — `proxy.yaml` ✅

- [x] Created `config/proxy.yaml` with `additional_policies` route
- [x] Mounted `proxy.yaml` into OpenCloud container via docker-compose.voting.yml

### 4b. API auth middleware — decode `X-Access-Token` ✅

- [x] JWT decoding from `X-Access-Token` header (using `jose` library)
- [x] JWT decoding from `Authorization: Bearer` header (web extension)
- [x] Extract user identity from `preferred_username` or `sub` claims
- [x] Optional JWKS signature validation when `OIDC_ISSUER` is set
- [x] Basic Auth fallback only when `NODE_ENV !== 'production'`
- [x] Removed invented `X-Opencloud-User` header

### 4c. Web extension — token forwarding ✅

- [x] `App.vue` imports `useAuthStore` from `@opencloud-eu/web-pkg`
- [x] Passes access token callback to `useVotingApi` composable
- [x] Graceful fallback when running outside OpenCloud Web (standalone dev)

### 4d. Input sanitization & rate limiting ✅

- [x] HTML stripping middleware (`sanitize.ts`) — strips tags, enforces max lengths
- [x] Rate limiter (`rateLimit.ts`) — 30 req/min per user with `X-RateLimit-*` headers

## Phase 5: Production Deployment

- [ ] Build and publish API Docker image to GHCR
- [ ] Create `proxy.yaml` template in `config/` for admin reference
- [ ] Document deployment procedure for OpenCloud admins
- [ ] Write admin configuration guide (env vars, volume mounts, proxy routing)

## Phase 6: CI/CD

- [ ] GitHub Actions: lint + test on PR
- [ ] GitHub Actions: build + Docker image on release
- [ ] Automated changelog generation
