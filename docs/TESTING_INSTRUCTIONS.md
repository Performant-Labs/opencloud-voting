# Testing Instructions (OpenCloud Extensions)

This document formalizes the methodology for testing and verifying OpenCloud frontend extensions (like Feature Voting). Since these applications interact intimately with OpenCloud’s Graph API, WebDAV project spaces, and OIDC authentication flow, testing them requires strict adherence to this runbook.

## Test Harness Setup

Before executing tests, your environment must be initialized to serve as a proper test harness. The test harness relies on a live OpenCloud backend and the Playwright browser automation framework.

1. **Install Dependencies:**
   Ensure you have installed all necessary node modules and the Playwright browsers required to run the automated tests.
   ```bash
   pnpm install
   pnpm exec playwright install
   ```

2. **Start the OpenCloud Stack:**
   Ensure that your local OpenCloud environment (`pl-opencloud-server`) is actively running. This serves as the remote backend for Graph API calls and WebDAV storage during the tests.

3. **Verify Environment Configuration:**
   Verify that any required configuration for the test suite is properly set up to point to your live `cloud.opencloud.test` development proxy.

---

## Core Verification Flow

To completely verify the code, you must execute the full end-to-end (E2E) collaborative testing sequence. Testing must always be performed against the **compiled code served by the reverse proxy**, not the local hot module reloading (HMR) server, to perfectly mimic production authentication.

### 1. Build and Deploy
Before executing any test suite, you must ensure the `cloud.opencloud.test` server is serving your latest Vue code.

```bash
# 1. Compile the static assets
pnpm build

# 2. Copy the freshly built files into the proxy's active application directory
cp -r dist/* ../../pl-opencloud-server/config/opencloud/apps/feature-voting/

# 3. (Optional) Force the proxy to reload and flush aggressive Etag caches
# In your pl-opencloud-server directory:
docker compose restart opencloud
```

### 2. Execute Test Runner
Execute Playwright. It will spawn fresh environments, automatically provision shared OpenCloud workspaces using the backend SDK, and execute the tests.

```bash
pnpm test:e2e
```

### 3. Verify System State
An effective test isn't just a UI interaction; it is a verification of the underlying state:
* Add diagnostic `data-*` attributes to core UI elements that reflect backend behavior (e.g., `<div data-space-id="[Current Project UUID]">`).
* Playwright assertions should explicitly target these attributes to confirm whether data was pulled from an isolated Personal Drive or a shared Project Drive.

---

## What We Discovered Along the Way

During the transition to central Project Spaces, we uncovered several critical architectural constraints related to testing OpenCloud applications. Keep these in mind to avoid false negatives.

### A. The "Zombie Code" Illusion
Because the Playwright framework hits `cloud.opencloud.test`, it actively bypasses your local `npm run dev` server. If you simply edit `useVotingApi.ts` and restart Playwright without rebuilding (`pnpm build`) and syncing (`cp -r ...`), Playwright will execute the tests against the **old** code logic indefinitely. This makes it seem as though your changes are having zero effect or that your logic is broken. Always deploy to the proxy before testing.

### B. Playwright Cannot Bypass the OIDC Flow
Attempting to create "core API" or direct integration tests using `page.request.get('/graph/v1.0/drives')` will fail silently with authentication errors. OpenCloud uses an OIDC Single-Page Architecture that requires a bearer token; this token is negotiated by the front-end SDK during login. Because a raw headless `fetch` script avoids the frontend, it lacks the correct OIDC `Authorization: Bearer` headers.

**The Solution:** Always perform reads/writes by driving the Vue frontend via `page.click()` / `page.fill()`. The frontend SDK automatically manages token attachment under the hood.

### C. Resource Starvation (Deadly Timeout Hangs)
If you forcefully cancel a running E2E test (e.g., `Ctrl+C` or a SIGINT from an AI agent), the test runner may leave headless Chromium and Node processes dangling in the background. Subsequent tests will hang, hitting severe 30-second timeouts, because the zombie browsers are locking ports and exhausting RAM/CPU.
**The Solution:** Run `pkill -f "node.*playwright"` before starting a fresh run if timeouts appear arbitrarily long. (See `TROUBLESHOOTING.md` for full instructions.)
