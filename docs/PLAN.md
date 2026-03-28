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

## Phase 2: Local Development Environment

- [ ] Verify `pnpm install` succeeds in both `api/` and `web/`
- [ ] Verify `pnpm test` passes in `api/`
- [ ] Verify `pnpm build` succeeds in `web/`
- [ ] Configure Docker Compose for standalone development
- [ ] Integrate with `pl-opencloud-server` DDEV environment

## Phase 3: Feature Completeness

- [ ] Verify API endpoint behavior (CRUD + vote toggle)
- [ ] Verify Vue component renders correctly in OpenCloud Web
- [ ] Add proper error handling and loading states
- [ ] Add pagination for large feature lists

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
