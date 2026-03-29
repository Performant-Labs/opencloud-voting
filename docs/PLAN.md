# Feature Voting App — Project Plan

## Overview
A highly secure, scalable feature voting board built as an OpenCloud Web extension, utilizing an OpenCloud-native **Go microservice sidecar** connected to a shared external SQLite volume. This architecture is explicitly designed to be natively compatible with oCIS (ownCloud Infinite Scale) for future upstream submission.

## AI Agent Instructions & Troubleshooting Protocols
Before any source code or docker compose modifications are made, the system must strictly adhere to the operational runbooks to ensure **zero hangs** and flawless execution:
- **[READ] `docs/ai_guidance/TROUBLESHOOTING.md`**: Exhaustively read the local troubleshooting instructions. This ensures that when configuring the tricky `proxy.yaml` routing constraints and proxy variables, we avoid the exact debugging loops and hanging pitfalls that caused previous sidecar iterations to be abandoned.

---

## Phase 1: Go Sidecar Scaffolding & High-Concurrency Shared DB

> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. We must exclusively mirror the standard `go.mod` structure, logging interfaces, and `proxy.yaml` routing definitions established by core OpenCloud microservices. Do not invent arbitrary infrastructure abstractions.

- **[NEW] `api/go.mod`**: Initialize the Go module (`github.com/opencloud-eu/feature-voting/api`).
- **[NEW] `api/Dockerfile`**: Create a lightweight Alpine multi-stage Dockerfile for the Go backend.
- **[MODIFY] `pl-opencloud-server` configuration**: 
  - Update `docker-compose.yml` to spin up the `voting-api` container.
  - Mount a shared `opencloud-extensions-data` Docker volume.
  - Implement `proxy.yaml` rules to securely route external requests from `/api/voting/*` directly to the new sidecar container.
- **[NEW] `api/main.go`**: Stub out the basic HTTP server using `net/http` and the data connection via a `DB_PATH` environment variable. 
  - **[SCALING]**: To survive a "Thundering Herd" (a massive spike of valid users voting simultaneously), the SQLite connection will strictly enforce `PRAGMA journal_mode=WAL` (Write-Ahead Logging) and `PRAGMA busy_timeout=5000`. This prevents "database is locked" crashes by allowing concurrent reads, while gracefully queuing incoming write requests at a highly performant rate.

**[VERIFY SUBMITTABILITY POST-PHASE]**: We must pause and audit the `docker-compose.yml` and `proxy.yaml` to ensure no custom routing bypasses or arbitrary proxy flags were created. The service networking must look identical to how OpenCloud natively wires up `.ocis/...` endpoints.

---

## Phase 2: Domain Models & OpenCloud Native Auth Middleware

> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. When handling OpenID Connect token authentication and rate limiting, we must directly re-use OpenCloud's established JWKs behavior and the `go-chi` ecosystem rather than architecting custom security layers.

- **[NEW] `api/models.go`**: Define the Go structs for the voting endpoints, along with the SQLite schema creation utilizing **prefixed table names** to avoid multi-extension collision.
- **[NEW] `api/middleware/auth.go`**: We will strictly **hook into OpenCloud's native authentication flow**. Instead of hardcoding JWT secrets, this Go middleware will dynamically fetch and validate the Bearer tokens against OpenCloud's specific oCIS `.well-known/openid-configuration` and `JWKs` (JSON Web Key Set) endpoints. This proves the extension is authentically interfacing with `oc` code.
- **[NEW] `api/middleware/rate_limit.go`**: We will use `github.com/go-chi/httprate` to apply our endpoint limits (e.g., 5 requests per second per user) natively within the standard `net/http` framework.

**[VERIFY SUBMITTABILITY POST-PHASE]**: We must pause and explicitly check that the Auth Middleware only fetches JSON Web Keys directly from OpenCloud's standard OIDC issuer endpoints. If it attempts to validate tokens using a hardcoded secret or fallback file, the step has failed and must be resolved.

---

## Phase 3: Implement Secure API Endpoints

> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. The API endpoints must consume and return JSON schemas that precisely match the standard REST conventions adopted by oCIS, avoiding custom bespoke payload wrappers.

Construct the core business logic querying the `voting_*` prefixed tables, relying on the hardened backend to enforce data constraints:
- **`GET /api/voting/features`**: Returns all features joined with vote counts.
- **`POST /api/voting/features`**: Validates input (max 255 char titles) and inserts new records into `voting_features`.
- **`DELETE /api/voting/features/{id}`**: Enforces strict authorization (only the contextual `userID` that created the feature can delete it).
- **`POST /api/voting/features/{id}/vote`**: Atomically toggles a vote inside `voting_votes`. Enforces database constraints to prevent duplicate votes.

**[VERIFY SUBMITTABILITY POST-PHASE]**: We must parse the Go controllers ensuring that `net/http` JSON Marshalling structures map cleanly to the original OpenCloud payload specifications without injecting proprietary wrapper logic or unsupported headers.

---

## Phase 4: Exhaustive Unit Testing (Backend)

> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. Go test files must utilize the standard library `net/http/httptest` and standard `testing` structs without relying on exotic third-party test runners or BDD syntactic sugar that the main project does not use.

To prove the module is structurally secure, we will write comprehensive Go unit tests (`api/*_test.go`) utilizing `net/http/httptest`:
1. **`TestAuthMiddleware`**: Verify that missing, expired, or cryptographically invalid OpenCloud JWTs are rejected.
2. **`TestCreateFeature`**: Verify submissions with empty titles or massively out-of-bounds payloads are rejected.
3. **`TestToggleVote`**: Verify parallel vote inflation attempts fail gracefully under simulated load.
4. **`TestDeleteFeature`**: Verify attackers cannot delete Features assigned to an unrelated User ID.

**[VERIFY SUBMITTABILITY POST-PHASE]**: We must ensure no third-party test-runners (like Ginkgo or Gomega) were used in `api_test.go`, verifying strict adherence to standard Go testing loops so that OpenCloud CI pipelines can natively parse test outputs.

---

## Phase 5: Revert and Wire the Vue Frontend to OpenCloud SDKs

> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. We must actively remove our raw `fetch()` logic and replace it exclusively with OpenCloud's published SDKs (`@opencloud-eu/web-client` or `@opencloud-eu/web-pkg`).

- **[MODIFY] `web/src/composables/useVotingApi.ts`**:
   - Strip out all WebDAV polling, XML logic, and manual ETag locking.
   - We will replace our raw standard `fetch()` calls. To ensure we are **hooking into the code provided by oc**, we will leverage the `@opencloud-eu/web-client` or `@opencloud-eu/web-pkg` SDK utilities directly for making authenticated network requests to our Go sidecar, ensuring perfect alignment with OpenCloud's frontend networking architecture.

**[VERIFY SUBMITTABILITY POST-PHASE]**: We must explicitly use `grep` (or manually analyze `useVotingApi.ts`) to verify that the standard global `fetch()` operator has been completely expunged in API calls, natively delegating authentication attachment and retries to the `@opencloud-eu/` imported wrappers.

---

## Phase 6: E2E Playwright Verification

> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. The E2E tests must pass inside the standard environment bounds without requiring special browser flags or out-of-band proxy tweaks that aren't natively supported.

- Final verify that the entire stack runs perfectly in the browser by running the updated `web/tests/e2e` suite against the live OpenCloud proxy and Go sidecar cluster.

**[VERIFY SUBMITTABILITY POST-PHASE]**: The Playwright output matrix must cleanly emulate OpenCloud's upstream End-to-End configuration, proving the app doesn't require "hacky" testing workarounds.

---

## Phase 7: Update Project Documentation

> [!WARNING]
> **Submittability Constraint:** Verify that this implementation does **not create a new code path**. Architectural decisions added to `ARCHITECTURE.md` must accurately reflect why standard microservice patterns were chosen and why custom web-hooks/WebDAV patterns were rejected.

Since we are reversing the recent architectural decision to abandon the sidecar, we must update all associated documentation.
- **[MODIFY] `README.md`**: Update the infrastructure diagram and quick-start instructions to include the Go building process.
- **[MODIFY] `docs/ARCHITECTURE.md`**: Add a new addendum overriding the previous decision, documenting exactly why WebDAV was abandoned for security reasons.

**[VERIFY SUBMITTABILITY POST-PHASE]**: The final review of `ARCHITECTURE.md` must accurately detail exactly how these Go microservices align natively with upstream oCIS design, serving as an explicit template for future OpenCloud developers reading the codebase.

---

## Phase 8: Production Deployment & CI/CD
- Build and publish API Docker image to GHCR.
- Ensure GitHub Actions handle automated testing and linting smoothly based on OpenCloud criteria.

---

## Phase 9: Final Whitehat Assessment & Penetration Test
Before finalizing the implementation, the AI agent must re-assume its "Whitehat Security Researcher" persona and perform a final penetration test against the deployed OpenCloud proxy and Go sidecar infrastructure. 
- **[AUDIT]**: Actively verify that the documented theoretical mitigations (Auth Middleware validation, SQLite WAL concurrent load handling, Submittability constraints) behave exactly as intended in practice.
- **[UPDATE]**: Refresh `docs/SECURITY_ASSESSMENT.md` with hard evidence and live findings, certifying the application stack officially clear for main-repo submission.
