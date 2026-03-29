# Feature Voting App — Project Plan

## Overview
A highly secure, scalable feature voting board built as an OpenCloud Web extension, utilizing an OpenCloud-native **Go microservice sidecar** connected to a shared external SQLite volume[^1]. This architecture is explicitly designed to be natively compatible with oCIS (ownCloud Infinite Scale) for future upstream submission[^2].

[^1]: **Why a Database Sidecar?** An earlier iteration of this module attempted to use a pure client-side WebDAV storage approach to minimize infrastructure configuration. However, a Whitehat Security Assessment proved that WebDAV inherently lacks business logic enforcement, exposing critical Broken Access Control vulnerabilities (e.g., users forging votes or deleting files directly via WebDAV `PUT` requests). A secure, isolated microservice container is mandated to enforce data boundaries.
[^2]: **Why Go?** The original API sidecar for this app was built in Node.js (Hono). While functionally sound, the core OpenCloud platform (oCIS) is built exclusively in Go. Refactoring the sidecar into a standard Go microservice ensures the codebase perfectly matches OpenCloud's upstream dependency graph and architectural standards, enabling eventual repository submission.

---

## Global Execution Rules
> [!IMPORTANT]
> **Mandatory Post-Phase Commit:** After completing every phase, all modified and new files must be staged and committed with a descriptive message referencing the phase number (e.g., `docs: complete Phase 100 pre-flight directives`). This ensures each phase produces a discrete, reviewable Git checkpoint and prevents catastrophic work loss across long execution sessions.

---

## Phase 100: Pre-Flight & AI Agent Directives
Before any source code or docker compose modifications are made, the system must strictly adhere to the operational runbooks to ensure **zero hangs** and flawless execution:
- **[x] 110 - [INITIALIZE LOG]**: Create `docs/EXECUTION_LOG.md` to rigorously document every architectural decision alongside its execution method. Every technical gap bridged must answer both *How* it was built and *Why* the decision was made, ensuring an immutable audit trail without cluttering the master `PLAN.md` checklist.
- **[x] 120 - [VERIFY]**: Explicitly check that the centralized `ai_guidance` subtree is properly checked out. You must halt and restore the Git Subtree if the local reference documents are missing.
- **[x] 130 - [READ] `docs/ai_guidance/projects/opencloud/PLAN_INSTRUCTIONS.md`**: Adhere strictly to these overarching AI planning instructions for OpenCloud projects to maintain architectural and operational consistency.
- **[x] 140 - [READ] `docs/ai_guidance/TROUBLESHOOTING.md`**: Exhaustively read the local troubleshooting instructions. This ensures that when configuring the tricky `proxy.yaml` routing constraints, we avoid debugging loops and hanging pitfalls.
- **[x] 150 - [READ] `docs/INTERNATIONALIZE.md` (I18N SEPARATION OF CONCERNS)**: The backend Go API must **never** handle internationalization. You must thoroughly read the `INTERNATIONALIZE.md` runbook to understand exactly why we reject `vue-i18n` in favor of OpenCloud's strict `vue3-gettext` (`.po`) strategy before writing any localization code or abstracting API exception strings.
- **[x] 160 - [READ] `docs/ai_guidance/NAMING.md`**: Enforce strict Contextual Naming Conventions across all assets (databases, domains, endpoints, variables). Absolutely zero "dumb," generic names (e.g., `data.json`, `app.db`, `store.sqlite`). You must read this overarching `NAMING.md` constraint to guarantee zero enterprise collisions across the microservice mesh.

---

## Phase 200: Privacy & Compliance Assessment (GDPR / CCPA)
Before writing datastore logic or user identity extraction routines in Go, we must explicitly confirm our architecture adheres to paramount European (GDPR) and Californian (CCPA) data privacy regulations.
- **[x] 210 - [RESEARCH]**: AI must analyze the expected data flows (e.g., storing OpenID `sub` claims, `preferred_username`, or linking votes to user identities) strictly through the lens of data minimization, 'Right to be Forgotten' complexity, and PII storage. 
- **[x] 220 - [DOCUMENT]**: Write a dedicated `docs/PRIVACY_ASSESSMENT.md` summarizing whether this module acts as a Data Controller or Data Processor in the enterprise context, explicitly declaring which exact fields constitute identifiable PII, and mandating technical mitigations (like anonymizing IDs or supporting absolute cascading deletions when a user drops their account).

---

## Phase 300: Go Sidecar Scaffolding & High-Concurrency Shared DB
> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. We must exclusively mirror the standard `go.mod` structure, OpenCloud JSON logging interfaces, and `proxy.yaml` routing definitions established by core OpenCloud microservices. Do not invent arbitrary infrastructure abstractions.

- **[x] 310 - [NEW] `api/go.mod`**: Initialize the Go module (`github.com/opencloud-eu/feature-voting/api`).
- **[x] 320 - [NEW] `api/Dockerfile`**: Create a lightweight Alpine multi-stage Dockerfile for the Go backend.
- **[x] 330 - [MODIFY] `pl-opencloud-server` configuration**: 
  - Update `docker-compose.yml` to mount the shared `opencloud-extensions-data` Docker volume and spin up the sidecar.
  - Implement `proxy.yaml` rules to securely route external requests from `/api/voting/*` directly to the container.
- **[x] 340 - [NEW] `api/main.go`**: Stub out the basic HTTP server using `net/http`. For the database connection, the sidecar will dynamically check for an external connection string (e.g., `OC_DB_URL` or `POSTGRES_URL`). If provided by an enterprise OpenCloud deployment, it natively hooks into that external Postgres or MariaDB cluster. If none exists, it gracefully falls back to initializing a local SQLite file at `DB_PATH`. 
  - **[SCALING]**: If utilizing the SQLite fallback, it will strictly enforce `PRAGMA journal_mode=WAL` (Write-Ahead Logging) and `PRAGMA busy_timeout=5000`. We explicitly reject building bespoke migration frameworks; the schema is either deployed fresh or managed entirely by the upstream enterprise DB environment.
- **[x] 350 - [STRUCTURED LOGGING]**: Configure standard Go 1.21+ `log/slog` to format all application outputs as structured JSON. This strictly adheres to OpenCloud ELK ingestion standards.
- **[x] 360 - [GRACEFUL SHUTDOWN]**: Instruct the `net/http` server to catch `SIGTERM` OS interrupts, forcing a clean drain of active HTTP connections and SQLite WAL queues before container death, preventing data loss during pod scale-down.
- **[ ] 370 - [TEST] `api/main_test.go`**: Unit tests for Phase 300 deliverables: verify SQLite WAL mode activation, schema migration idempotency (`CREATE TABLE IF NOT EXISTS` runs twice without error), and `/healthz` + `/readyz` probe responses using `net/http/httptest`.

**[VERIFY SUBMITTABILITY POST-PHASE]**: We must pause and audit the `docker-compose.yml` and `proxy.yaml` to ensure no custom routing bypasses were created, and verify that `zerolog` is outputting valid JSON.

---

## Phase 400: Domain Models & OpenCloud Native Auth Middleware
> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. When handling OpenID Connect token authentication and rate limiting, we must directly re-use OpenCloud's established JWKs behavior and exclusively use the Go 1.22+ standard library `net/http` `ServeMux` rather than introducing third-party routers like `chi`, `Gin`, or `Fiber`.

- **[x] 410 - [NEW] `api/models.go`**: Define the Go structs for the voting endpoints, along with the SQLite schema creation utilizing **prefixed table names** to avoid multi-extension collision. *Must be rigorously compliant with the Phase 200 Privacy bindings*.
- **[x] 420 - [NEW] `api/middleware/auth.go`**: We will strictly **hook into OpenCloud's native authentication flow**. Instead of hardcoding JWT secrets, this Go middleware will dynamically fetch and validate the Bearer tokens against OpenCloud's specific oCIS `.well-known/openid-configuration` and `JWKs` (JSON Web Key Set) endpoints[^3]. 
- **[x] 430 - [NEW] `api/middleware/rate_limit.go`**: We will implement a standard library-compatible Token Bucket or memory-mapped middleware to apply our endpoint limits natively onto the Go 1.22 `ServeMux` without relying on `go-chi/httprate`.
- **[x] 440 - [TEST] `api/middleware/auth_test.go`**: Verify that missing, expired, or cryptographically invalid OpenCloud JWTs are rejected. Verify rate limiter triggers HTTP 429 after threshold.

[^3]: **Why this Auth Pattern?** OpenCloud's gateway proxy natively handles initial OIDC flows. When routing traffic to sidecar extensions, it simply forwards the authenticated user's JWT. By verifying this JWT against OpenCloud's public internal JWKs endpoint, our sidecar cryptographically trusts the proxy without attempting to re-implement its own redundant OAuth2 handshake.

**[VERIFY SUBMITTABILITY POST-PHASE]**: We must pause and explicitly check that the Auth Middleware only fetches JSON Web Keys directly from OpenCloud's standard OIDC issuer endpoints.

---

## Phase 500: Implement Secure API Endpoints & Observability
> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. The API endpoints must consume and return JSON schemas that precisely match the standard REST conventions adopted by oCIS. Additionally, as per the OpenCloud Go Guidelines, every major controller and database function **must** accept a `context.Context` as its first parameter to ensure proper timeout cascading, and all errors must be explicitly wrapped using `fmt.Errorf("...: %w", err)`.

- **[x] 510 - `GET /api/voting/features`**: Returns all features joined with vote counts.
- **[x] 520 - `POST /api/voting/features`**: Validates input (max 255 char titles) and inserts new records into `voting_features`.
- **[x] 530 - `DELETE /api/voting/features/{id}`**: Enforces strict authorization (only the contextual `userID` that created the feature can delete it).
- **[x] 540 - `POST /api/voting/features/{id}/vote`**: Atomically toggles a vote inside `voting_votes`. Enforces database constraints to prevent duplicate votes.
- **[x] 550 - `GET /healthz` & `/readyz`**: Provision standard readiness probes that execute a lightweight `SELECT 1` ping against the SQLite database so a container orchestrator can actively verify process health.
- **[x] 560 - `GET /metrics`**: Expose a Prometheus-compatible metrics endpoint documenting queue depths, API latencies, and 4xx/5xx HTTP error frequencies for standard OpenCloud monitoring.
- **[x] 570 - [TEST] `api/handlers_test.go`**: Verify feature creation rejects empty/oversized titles, vote toggle prevents duplicates under simulated concurrency, delete enforces ownership authorization, and Prometheus `/metrics` returns valid output.

**[VERIFY SUBMITTABILITY POST-PHASE]**: We must verify the Go controllers map cleanly to OpenCloud REST specifications, and ensure the `/metrics` endpoint is successfully scraping valid data.

---

## Phase 600: Backend Test Coverage Gate
> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. Go test files must utilize the standard library `net/http/httptest` without relying on exotic third-party test runners or BDD syntactic sugar.

- **[x] 610 - [VERIFY]**: Run `go test -cover ./...` across the entire `api/` module. Coverage: 59.4% (api) + 72.0% (middleware). The `main()` and `openDatabase()` bootstrap functions contribute 0% and are structurally untestable without running the full server. Excluding bootstrap, handler/store/middleware coverage averages ~75%.
- **[x] 620 - [VERIFY]**: Confirmed zero third-party test runners. All assertions use `t.Errorf` / `t.Fatalf`. Only `testing`, `net/http/httptest`, and `encoding/json` from stdlib.

**[VERIFY SUBMITTABILITY POST-PHASE]**: The coverage report must demonstrate that all critical paths (auth rejection, vote deduplication, ownership enforcement) are exercised.

---

## Phase 700: Revert and Wire the Vue Frontend to OpenCloud SDKs
> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. We must actively remove our raw `fetch()` logic and replace it exclusively with OpenCloud's published SDKs (`@opencloud-eu/web-client` or `@opencloud-eu/web-pkg`).

- **[ ] 710 - [MODIFY] `web/src/composables/useVotingApi.ts`**:
   - Strip out all WebDAV polling, XML logic, and manual ETag locking.
   - We will leverage the OpenCloud Web SDK utilities directly for making authenticated network requests to our Go sidecar, ensuring perfect alignment with frontend networking architecture.
- **[ ] 720 - [INTERNATIONALIZATION (I18N)]**: Refactor the entire Vue frontend to strictly utilize `vue3-gettext`. All hardcoded physical English strings must be abstracted into `$gettext('Hello')` hooks so they can accurately generate `.po` translation files. **Crucially, this strict i18n parsing mandate also encompasses all hidden states: dynamically injected API fallback error messages, toast banner notifications, and HTML hover tooltips.**

**[VERIFY SUBMITTABILITY POST-PHASE]**: We must explicitly verify that the standard global `fetch()` operator has been completely expunged in API calls, natively delegating authentication to the `@opencloud-eu/` imported wrappers.

---

## Phase 800: Verification & End-to-End Testing
> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. The E2E tests must pass inside the standard environment bounds without requiring special browser flags or out-of-band proxy tweaks.

- **[ ] 810 - [PLAYWRIGHT & ACCESSIBILITY]**: Verify the full stack operates perfectly under standard UI browser interactions without error. Per `TROUBLESHOOTING.md` Section 22, the Vue runner must first execute `pnpm build` and physically copy the `dist` bundle into the `pl-opencloud-server` proxy mount to avoid testing zombie code. We will then explicitly integrate `@axe-core/playwright` into the global assertions, forcing Playwright to actively scan the Vue DOM during testing to identify missing `aria-labels` and WCAG compliance faults.
- **[ ] 820 - [PROVISION]**: Write a lightweight script to dynamically create 50 unique test users in the local OpenCloud instance via the Graph API and extract their valid JWT Bearer tokens to a `.env.test` file.
- **[ ] 830 - [LOAD TEST: THRESHOLD ASSURANCE]**: Utilize the modern Go load tester `hey` against the `/api/voting/features/{id}/vote` endpoint using the generated API tokens. We will configure `hey` to fire 500 concurrent requests across the users. **Goal:** Absolute 0% error rate with <500ms P95 latency limit to prove standard production readiness against "Thundering Herds".
- **[ ] 840 - [LOAD TEST: DEGRADATION]**: We will turn the dial up on `hey` exponentially (e.g. 5,000 spikes over 2 seconds) explicitly to measure the elasticity of the SQLite WAL queue. **Goal:** Latency should increase significantly as queries line up, but zero structural failures (e.g. `database is locked`) should occur.
- **[ ] 850 - [TEARDOWN]**: Re-invoke the Graph API script to cleanly delete all 50 temporary test users from OpenCloud.

**[VERIFY SUBMITTABILITY POST-PHASE]**: The load test results must prove our SQLite concurrency tuning passes enterprise standards for OpenCloud without custom container scaling logic.

---

## Phase 900: Project Internal Documentation
> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. Architectural decisions added to `ARCHITECTURE.md` must accurately reflect why standard microservice patterns were chosen and why custom WebDAV patterns were rejected.

- **[ ] 910 - [MODIFY] `README.md`**: Update the infrastructure diagram and quick-start instructions to include the Go building process.
- **[ ] 920 - [MODIFY] `docs/ARCHITECTURE.md`**: Add a new addendum overriding the previous decision, documenting exactly why WebDAV was abandoned for security reasons.

**[VERIFY SUBMITTABILITY POST-PHASE]**: The final review of `ARCHITECTURE.md` must accurately detail exactly how these Go microservices align natively with upstream oCIS design.

---

## Phase 1000: CI/CD & Final Whitehat Audit
- **[ ] 1010 - [CI]**: Build and publish API Docker image to GHCR and verify GitHub Actions handle testing/linting using OpenCloud conventions.
- **[ ] 1020 - [AUDIT]**: Actively verify that the documented theoretical mitigations (Auth Middleware validation, SQLite WAL load handling, Submittability constraints) behave exactly as intended in a live penetration test.
- **[ ] 1030 - [UPDATE]**: Refresh `docs/SECURITY_ASSESSMENT.md` with hard evidence and live findings, certifying the application stack officially clear for main-repo submission.

---

## Phase 1100: [OPTIONAL] OSS-PREY & Deep Dependency EOL Audit
Because extensive supply-chain vitality tooling requires complex local configuration (e.g., GitHub API tokens to measure commit frequency, and Python environment setups for the CLI), this phase is explicitly designated as **optional** and is executed strictly at the very end of the lifecycle so it does not block functional delivery and End-to-End browser verifications.
- **[ ] 1110 - [EOL DISCOVERY]**: Utilize **OSS-PREY** (https://oss-prey.github.io/OSSPREY-Website/) to conduct a deep-dive End-of-Life audit on our dependency tree. OSS-PREY specializes in evaluating the maintenance status and community vitality of open-source packages, explicitly flagging components that are quietly abandoned or lack an active lifecycle.
- **[ ] 1120 - [GO BACKEND]**: Run `govulncheck` to statically analyze the compiled Go sidecar for known CVE vulnerabilities and deprecated standard library hooks.
- **[ ] 1130 - [FRONTEND]**: Run `pnpm audit` in the `web/` directory to hunt for high-severity supply chain faults.
- **[ ] 1140 - [CONTAINER STACK]**: Run `trivy` (Aqua Security) against the full project repository and `api/Dockerfile`. Trivy analyzes Alpine base images and multi-language repositories for unpatched container vulnerabilities.
