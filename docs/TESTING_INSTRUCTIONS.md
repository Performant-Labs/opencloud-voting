# Testing Instructions (OpenCloud Extensions)

This document formalizes the methodology for testing and verifying OpenCloud frontend extensions (like Feature Voting). Since these applications interact intimately with OpenCloud's Graph API, WebDAV project spaces, and OIDC authentication flow, testing them requires strict adherence to this runbook.

## Test Harness Setup

Before executing tests, your environment must be initialized to serve as a proper test harness. The test harness relies on a live OpenCloud backend and the Playwright browser automation framework.

1. **Verify the OpenCloud stack is running:**
   ```bash
   curl -sk https://cloud.opencloud.test/status.php
   ```
   You should see a JSON response. If not, start your OpenCloud deployment first.

2. **Install dependencies:**
   ```bash
   cd web
   pnpm install
   pnpm exec playwright install
   ```

3. **Set admin credentials (if not default):**
   If your admin password is not `admin`, export it:
   ```bash
   export ADMIN_PASSWORD=YourAdminPassword
   ```

4. **Enable Basic Auth (required for test user provisioning):**
   The E2E tests create and delete test users via the Graph API using HTTP Basic Auth. Add this to your OpenCloud deployment's `.env` file:
   ```dotenv
   PROXY_ENABLE_BASIC_AUTH=true
   ```
   Then restart: `docker compose up -d opencloud`

---

## Core Verification Flow

To completely verify the code, you must execute the full end-to-end (E2E) collaborative testing sequence. Testing must always be performed against the **compiled code served by the reverse proxy**, not the local hot module reloading (HMR) server, to perfectly mimic production authentication.

### 1. Build and Deploy
Before executing any test suite, you must ensure the `cloud.opencloud.test` server is serving your latest Vue code.

```bash
# Build and deploy in one step (recommended)
make deploy

# Or manually:
cd web && pnpm build
cp -r dist/* /path/to/your/opencloud-compose/config/opencloud/apps/feature-voting/
cd /path/to/your/opencloud-compose && docker compose restart opencloud
```

### 2. Execute Tests

```bash
# Using Make (passes ADMIN_PASSWORD automatically):
make test-e2e ADMIN_PASSWORD=YourAdminPassword

# Or directly:
cd web
ADMIN_PASSWORD=YourAdminPassword npx playwright test --reporter=list
```

The suite runs 19 tests across 5 spec files:

| Spec file | Tests | What it covers |
|:----------|:------|:---------------|
| `smoke.spec.ts` | 5 | Board load, validation, submit, vote toggle, delete |
| `comments.spec.ts` | 5 | Create/view/delete comments across users |
| `vote-targeting.spec.ts` | 4 | Vote accuracy across multiple features |
| `voting.spec.ts` | 4 | Multi-user create/vote/delete lifecycle |
| `get-admin-token.spec.ts` | 1 | Bearer token capture for load tests |

### 3. Verify System State
An effective test isn't just a UI interaction; it is a verification of the underlying state:
* Add diagnostic `data-*` attributes to core UI elements that reflect backend behavior (e.g., `<div data-space-id="[Current Project UUID]">`).
* Playwright assertions should explicitly target these attributes to confirm whether data was pulled from an isolated Personal Drive or a shared Project Drive.

---

## Configuration

All E2E test configuration is centralized in [`playwright.config.ts`](../web/playwright.config.ts):

| Setting | Source | Default |
|:--------|:-------|:--------|
| Base URL | `use.baseURL` | `https://cloud.opencloud.test` |
| Admin username | `use.httpCredentials.username` | `admin` |
| Admin password | `use.httpCredentials.password` | `process.env.ADMIN_PASSWORD` or `admin` |
| HTTPS errors | `use.ignoreHTTPSErrors` | `true` (for self-signed certs) |

Override at runtime:
```bash
ADMIN_PASSWORD=secret npx playwright test
```

---

## What We Discovered Along the Way

During the transition to central Project Spaces, we uncovered several critical architectural constraints related to testing OpenCloud applications. Keep these in mind to avoid false negatives.

### A. The "Zombie Code" Illusion
Because the Playwright framework hits `cloud.opencloud.test`, it actively bypasses your local `npm run dev` server. If you simply edit `useVotingApi.ts` and restart Playwright without rebuilding (`pnpm build`) and syncing (`make deploy`), Playwright will execute the tests against the **old** code logic indefinitely. This makes it seem as though your changes are having zero effect or that your logic is broken. Always deploy to the proxy before testing.

### B. OIDC Login Flow in Tests
OpenCloud uses an OIDC Single-Page Architecture that negotiates Bearer tokens during login. The E2E tests log in via the browser UI (`page.fill` + "Log in" button), then wait for the OIDC redirect to complete. On self-signed certificate environments, use:
- `waitForSelector("#oc-login-username", { state: "detached" })` — detects login form disappearance
- `waitForTimeout(2000)` — allows OIDC redirect chain to settle
- `{ waitUntil: "domcontentloaded" }` on subsequent `page.goto()` calls

### C. Resource Starvation (Deadly Timeout Hangs)
If you forcefully cancel a running E2E test (e.g., `Ctrl+C` or a SIGINT from an AI agent), the test runner may leave headless Chromium and Node processes dangling in the background. Subsequent tests will hang, hitting severe 30-second timeouts, because the zombie browsers are locking ports and exhausting RAM/CPU.
**The Solution:** Run `pkill -f "node.*playwright"` before starting a fresh run if timeouts appear arbitrarily long.
