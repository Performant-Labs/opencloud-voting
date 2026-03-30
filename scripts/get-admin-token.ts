/**
 * get-admin-token.ts
 *
 * Headless Playwright script that logs in as admin and extracts the
 * Bearer token from the OpenCloud web app's OIDC auth store.
 * Prints the raw token to stdout for use by shell scripts.
 *
 * Usage:
 *   npx playwright test --config=scripts/pw-token.config.ts scripts/get-admin-token.ts
 *
 * Or via the load-test.sh wrapper (preferred).
 */

import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Intercept the first authenticated API call to capture the Bearer token
  let token = "";
  page.on("request", (req) => {
    if (!token) {
      const auth = req.headers()["authorization"] || "";
      if (auth.startsWith("Bearer ")) {
        token = auth.slice(7);
      }
    }
  });

  await page.goto("https://cloud.opencloud.test/");
  await page.fill("#oc-login-username", "admin");
  await page.fill("#oc-login-password", "admin");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/.*\/files\/.*/, { timeout: 30000 });

  // Navigate to the voting app to trigger an authenticated API call
  await page.goto("https://cloud.opencloud.test/feature-voting/board");
  // Wait for the API call to fire
  await page.waitForTimeout(3000);

  await browser.close();

  if (!token) {
    process.stderr.write("ERROR: could not capture Bearer token\n");
    process.exit(1);
  }

  process.stdout.write(token);
})();
