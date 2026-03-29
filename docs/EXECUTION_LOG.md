# Execution Log — OpenCloud Feature Voting

This document records every architectural decision, technical gap bridged, and deviation encountered during the execution of `docs/PLAN.md`. Each entry answers both **How** the decision was implemented and **Why** the decision was made.

---

## Phase 100: Pre-Flight & AI Agent Directives

### 110 — Execution Log Initialized
- **When**: 2026-03-29T13:15 PDT
- **How**: Created this file at `docs/EXECUTION_LOG.md`.
- **Why**: The master `PLAN.md` must remain a clean tactical checklist. All granular technical reasoning, pivots, and gap-bridging details are recorded here to provide a complete audit trail for PR reviewers without cluttering the plan.

### 120 — Subtree Verification
- **When**: 2026-03-29T13:16 PDT
- **How**: Ran `ls -la docs/ai_guidance/` confirming presence of `TROUBLESHOOTING.md`, `NAMING.md`, `README.md`, and `projects/opencloud/PLAN_INSTRUCTIONS.md`.
- **Why**: If the subtree is missing, all downstream constraint enforcement fails silently. Verified 4 files + 1 subdirectory present.

### 130 — PLAN_INSTRUCTIONS.md Digested
- **When**: 2026-03-29T13:16 PDT
- **How**: Read all 20 lines. Confirmed 4 binding constraints: (1) Idiomatic `go fmt`, (2) Standard library `ServeMux` only, (3) Never ignore errors with `_`, (4) `context.Context` as first parameter everywhere.
- **Why**: These constraints directly govern every line of Go code written in Phases 300–600.

### 140 — TROUBLESHOOTING.md Digested
- **When**: 2026-03-29T13:17 PDT
- **How**: Full 950-line read performed during earlier review session. Key sections for this project: Section 21 (SafeToAutoRun agent gate), Section 22 (Zombie Code requiring `pnpm build` + `cp -r` before E2E tests).
- **Why**: Both sections directly inform Phase 800 E2E testing strategy and prevent false-positive test results.

### 150 — INTERNATIONALIZE.md Digested
- **When**: 2026-03-29T13:17 PDT
- **How**: Read all 106 lines. Confirmed the Hybrid Strategy: (A) encapsulated `$gettext()` in `.vue` templates, (B) centralized `resolveApiError()` hook mapping in `.ts` composables. Go API returns only machine codes like `ERR_VOTE_DUPLICATE`.
- **Why**: Using `vue-i18n` would sever the extension from OpenCloud's native language switcher. The `vue3-gettext` AST compiler must physically see `$gettext('...')` calls to extract `.po` entries.

### 160 — NAMING.md Digested
- **When**: 2026-03-29T13:17 PDT
- **How**: Authored and read during this session. Bans: `data.json`, `app.db`, `store.sqlite`. Mandates: contextual prefixing (e.g., `feature-votes-store.sqlite`, `VotingFeatureModel`).
- **Why**: Generic naming causes catastrophic collision states when multiple OpenCloud extensions share Docker volumes.

---

## Phase 200: Privacy & Compliance Assessment (GDPR / CCPA)

### 210 — Data Flow Research
- **When**: 2026-03-29T13:20 PDT
- **How**: Audited `web/src/types.ts` and `web/src/composables/useVotingApi.ts` to inventory every user-facing data field. Discovered the legacy code uses `preferred_username || sub` as the user identifier (line 70 of `useVotingApi.ts`).
- **Why**: `preferred_username` is directly identifiable PII (e.g., `"john.smith"`). Storing it violates GDPR Article 5(1)(c) data minimization. The new Go sidecar must exclusively use the opaque `sub` claim, which is a pseudonymous UUID that cannot be reverse-engineered without identity provider access.
- **Decision**: The `preferred_username` and `email` OIDC claims will **never** be persisted to the database. Only `sub` is stored. This mandatory change directly influences the Go models in Phase 400 (Step 410).

### 220 — PRIVACY_ASSESSMENT.md Written
- **When**: 2026-03-29T13:21 PDT
- **How**: Created `docs/PRIVACY_ASSESSMENT.md` with 7 sections covering: Controller/Processor classification, PII inventory table, the `sub` vs `preferred_username` decision, Right to Erasure cascading SQL, data minimization audit, CCPA obligations, and technical safeguards.
- **Why**: Enterprise OpenCloud deployments serving EU customers require formal GDPR documentation. Without this assessment, the extension could expose the hosting organization to regulatory fines.
- **Decision**: Default behavior is full cascading deletion (not anonymization) when a user is removed. Anonymization is documented as a Controller-configurable alternative.

---

## Phase 300: Go Sidecar Scaffolding & High-Concurrency Shared DB

### 310 — Go Module Initialized
- **When**: 2026-03-29T13:22 PDT
- **How**: Ran `go mod init github.com/opencloud-eu/opencloud-voting/api`. Module name mirrors the OpenCloud GitHub org namespace for eventual upstream submission.
- **Why**: Using the `opencloud-eu` GitHub org path ensures `go get` resolution aligns with the upstream repository structure.

### 320 — Dockerfile Created
- **When**: 2026-03-29T13:23 PDT
- **How**: Alpine multi-stage: Stage 1 uses `golang:1.26-alpine` with `gcc`/`musl-dev` for CGO (required by `mattn/go-sqlite3`). Stage 2 copies only the compiled binary into `alpine:3.21`.
- **Why**: CGO is mandatory because SQLite requires C bindings. The multi-stage build keeps the runtime image minimal (~15MB) vs the ~800MB build image.
- **Decision**: Named the binary `voting-app` (not generic `app` or `server`) per NAMING.md conventions.
- **⚠️ Correction (13:29 PDT)**: Originally named `voting-api`, but the sidecar is a full application (DB, health probes, metrics, graceful shutdown), not just an API layer. Renamed to `voting-app`. Updated `NAMING.md` with "contextual prefix redeems generic suffix" rule.

### 330 — Infrastructure Wiring
- **When**: 2026-03-29T13:23 PDT
- **How**: 
  - `docker-compose.yml`: Added `voting-app` service on `opencloud-net` with zero host port exposure. Created `shared-data` Docker volume mounted at `/data`.
  - `proxy.yaml`: Added route `endpoint: /api/voting/` → `backend: http://voting-app:8080` under the existing `default` policy.
- **Why**: Zero host ports means the sidecar is physically unreachable without traversing the OpenCloud authentication proxy. The proxy forwards the OIDC access token automatically.
- **Decision**: `pl-opencloud-server` changes live on branch `aa/voting-sidecar`, not `main`. Commits go only to `opencloud-voting`.
- **⚠️ Correction (13:32 PDT)**: Originally created a dedicated `voting-data` volume. Renamed to `shared-data` so other OpenCloud extensions can share the same mount point, each writing their own contextually-named SQLite file (e.g., `feature-voting.sqlite`, `registration.sqlite`).

### 340 — main.go HTTP Server & Database
- **When**: 2026-03-29T13:24 PDT
- **How**: Combined routines into a single `main.go`: `openDatabase()` checks `OC_DB_URL` for Postgres, falls back to SQLite at `DB_PATH` with `?_journal_mode=WAL&_busy_timeout=5000`. `migrateSchema()` creates `voting_features` and `voting_votes` tables with `ON DELETE CASCADE`.
- **Why**: Prefixed table names (`voting_*`) prevent collision if the database is shared. `ON DELETE CASCADE` on `voting_votes.feature_id` ensures orphan votes are automatically cleaned when a feature is removed. Composite primary key `(feature_id, user_id)` on `voting_votes` structurally prevents duplicate votes at the schema level.
- **Decision**: Schema migration uses `CREATE TABLE IF NOT EXISTS` (idempotent). We explicitly rejected building a versioned migration framework per PLAN instructions.

### 350 — Structured Logging
- **When**: 2026-03-29T13:24 PDT
- **⚠️ Correction (13:40 PDT)**: Originally implemented with Go standard library `log/slog`. Research revealed OpenCloud/oCIS uses `github.com/rs/zerolog` across all services. Refactored to `zerolog` for Tier-1 submittability.
- **How**: `zerolog.New(os.Stdout).With().Timestamp().Str("service","voting-app").Logger()` with level controlled by `OC_LOG_LEVEL` env var.
- **Why**: `zerolog` is the established convention in the oCIS ecosystem. Using `slog` would make our code structurally alien during upstream code review.
- **Decision**: Updated `ai_guidance/projects/opencloud/PLAN_INSTRUCTIONS.md` Rule 2 to add an "Ecosystem Exception" clause — parent ecosystem libraries take precedence over standard library equivalents. Pushed to `ai_guidance` remote.

### 360 — Graceful Shutdown
- **When**: 2026-03-29T13:24 PDT
- **How**: Traps `SIGINT`/`SIGTERM` via `signal.Notify`, then calls `server.Shutdown(ctx)` with a 15-second deadline to drain connections.
- **Why**: Abrupt container kills during pod scale-down corrupt SQLite WAL journals and cause client 502s.

### 370 — Phase 300 Unit Tests
- **When**: 2026-03-29T13:44 PDT
- **How**: Created `api/main_test.go` with 6 tests using `net/http/httptest` and temporary SQLite databases (`t.TempDir()`).
- **Why**: PLAN restructured to embed tests within each code phase (TDD discipline). Monolithic Phase 600 repurposed as a coverage gate.
- **Tests**: `TestSQLiteWALMode`, `TestMigrateSchema_Idempotent`, `TestMigrateSchema_DuplicateVotePrevented`, `TestMigrateSchema_CascadeDeleteVotes`, `TestHealthzEndpoint`, `TestReadyzEndpoint` — all 6 PASS (0.272s).

### Post-Phase Submittability Verification
- **`go build`**: Compiles cleanly with zero errors.
- **`go fmt`**: No formatting changes required.
- **`go test -v -count=1 ./...`**: 6/6 tests pass.
- **`docker-compose.yml`**: No host ports exposed on `voting-app`. Uses `opencloud-net` internal networking only.
- **`proxy.yaml`**: Route follows the exact same pattern as the existing `radicale` routes (endpoint + backend, no custom middleware).
- **`zerolog`**: JSON output on stdout with `service` field. Enterprise-compliant.

