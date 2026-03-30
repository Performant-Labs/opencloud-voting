/**
 * get-admin-token.spec.ts
 *
 * Playwright test that logs in as admin, captures the Bearer token
 * from outgoing API requests, and writes it to scripts/admin-token.txt.
 * Run with: npx playwright test tests/e2e/get-admin-token.spec.ts --project=chromium
 */

import { test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("capture admin Bearer token", async ({ page }) => {
  const password = test.info().project.use.httpCredentials?.password || "admin";
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
  await page.fill("#oc-login-password", password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForSelector("#oc-login-username", { state: "detached", timeout: 30000 });

  // Navigate to voting app to trigger an authenticated API call
  await page.goto("/feature-voting/board");
  await page.waitForTimeout(3000);

  const outPath = path.resolve(__dirname, "../scripts/admin-token.txt");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, token);
  console.log(`Token written to ${outPath} (${token.length} chars)`);
});
