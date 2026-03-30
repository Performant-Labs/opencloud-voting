import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for OpenCloud Voting App E2E tests.
 *
 * Admin credentials are centralised here.  Override via environment
 * variables when targeting a different OpenCloud instance:
 *
 *   ADMIN_PASSWORD=secret  npx playwright test
 */

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: "html",

  use: {
    baseURL: "https://cloud.opencloud.test",
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    video: "on-first-retry",

    /**
     * HTTP credentials used by Playwright's API request contexts
     * and made available to every test via `use.httpCredentials`.
     */
    httpCredentials: {
      username: "admin",
      password: ADMIN_PASSWORD,
    },
  },

  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
