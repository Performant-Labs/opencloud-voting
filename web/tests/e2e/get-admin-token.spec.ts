/**
 * get-admin-token.spec.ts
 *
 * Playwright test that logs in as admin, captures the Bearer token
 * from outgoing API requests, and writes it to scripts/admin-token.txt.
 * Run with: npx playwright test scripts/get-admin-token.spec.ts --project=chromium
 */

import { test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test("capture admin Bearer token", async ({ page }) => {
  let token = "";

  page.on("request", (req) => {
    if (!token) {
      const auth = req.headers()["authorization"] || "";
      if (auth.startsWith("Bearer ")) {
        token = auth.slice(7);
      }
    }
  });

  await page.goto("/");
  await page.fill("#oc-login-username", "admin");
  await page.fill("#oc-login-password", "admin");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/.*\/files\/.*/, { timeout: 30000 });

  // Navigate to voting app to trigger an authenticated API call
  await page.goto("/feature-voting/board");
  await page.waitForTimeout(3000);

  const outPath = path.resolve(__dirname, "../scripts/admin-token.txt");
  fs.writeFileSync(outPath, token);
  console.log(`Token written to ${outPath} (${token.length} chars)`);
});
