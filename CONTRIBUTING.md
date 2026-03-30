# Contributing to Feature Voting for OpenCloud

Thank you for your interest in contributing. This document covers how to report bugs, suggest features, and submit code changes.

---

## Reporting Bugs

Please [open an issue](https://github.com/Performant-Labs/opencloud-voting/issues/new) and include:

- Your OpenCloud version (`docker inspect opencloud | grep OC_DOCKER_TAG`)
- The Feature Voting version (check the GitHub Release tag)
- Steps to reproduce the problem
- What you expected vs. what actually happened
- Any relevant browser console or container log output (`docker compose logs voting-app`)

---

## Suggesting Features

Open an issue with the `enhancement` label. Describe the use case, not just the feature — it helps evaluate whether it fits the scope of the project.

---

## Submitting a Pull Request

1. Fork the repository and create a branch from `main`:
   ```bash
   git checkout -b fix/my-bug-fix
   ```

2. Make your changes. See the sections below for what's expected.

3. Run the tests before opening a PR:
   ```bash
   # Frontend unit tests
   cd web && pnpm test:unit

   # Go unit tests
   cd api && go test ./...

   # Lint
   cd web && pnpm lint
   ```

4. Open a PR against `main`. Describe what changed and why. Reference any related issue with `Closes #123`.

---

## What to Expect

- PRs are reviewed on a best-effort basis — this is a small project
- Keep changes focused; large PRs combining multiple concerns are harder to review
- New API endpoints need a corresponding unit test in `api/handlers_test.go`
- New UI behaviour needs coverage in `web/tests/e2e/smoke.spec.ts` or a unit test

---

## Code Style

**Go (API):**
- `gofmt`-formatted (enforced by linter)
- No third-party frameworks — stdlib `net/http` only
- All database access through `store.go` — no raw SQL in handlers
- Error responses must use `{"error_code": "...", "message": "..."}` JSON shape

**Vue / TypeScript (frontend):**
- Prettier-formatted (`pnpm format:write`)
- All API calls go through the `useVotingApi` composable — no direct `fetch` in components
- Never use `v-html` — all user content rendered via `{{ }}` text interpolation
- Accessible markup: validation errors as `role="alert"` banners, semantic HTML

---

## Project Scope

This extension is intentionally scoped to feature voting inside a single OpenCloud instance. Out-of-scope contributions (e.g., multi-instance federation, authentication schemes other than OpenCloud OIDC, non-Docker deployment targets) are unlikely to be merged but may be a good basis for a fork.
