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

## Phase 4: Authentication & Security

- [ ] Configure OIDC token validation in API sidecar
- [ ] Add rate limiting
- [ ] Add input sanitization

## Phase 5: Production Deployment

- [ ] Build and publish API Docker image
- [ ] Document deployment procedure for OpenCloud admins
- [ ] Write admin configuration guide

## Phase 6: CI/CD

- [ ] GitHub Actions: lint + test on PR
- [ ] GitHub Actions: build + Docker image on release
- [ ] Automated changelog generation
