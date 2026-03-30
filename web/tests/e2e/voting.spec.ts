import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * OpenCloud Voting E2E Test Suite.
 * Cycles through multiple test users to verify collaborative functionality.
 *
 * Uses test.describe.serial because tests depend on each other:
 *   Alpha creates → Beta votes → Gamma votes → Alpha deletes
 *
 * Users are provisioned by global-setup.ts (Graph API) and written to
 * test-users.json. We read it lazily inside beforeAll so a missing file
 * causes a graceful skip rather than a module-load crash.
 */

const usersPath = path.join(__dirname, "test-users.json");
let testUsers: any[] = [];

test.describe.serial("Feature Voting App", () => {
  let alphaUser: any;
  let betaUser: any;
  let gammaUser: any;

  test.beforeAll(() => {
    // Lazy load — graceful skip if global-setup hasn't run yet
    if (fs.existsSync(usersPath)) {
      testUsers = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    }
    if (!testUsers || testUsers.length < 3) {
      test.skip(true, "Test users were not properly created in global setup.");
    }
    alphaUser = testUsers[0];
    betaUser = testUsers[1];
    gammaUser = testUsers[2];
  });

  let featureId: string;
  const featureTitle = `E2E Test Feature ${Date.now()}`;
  const featureDesc = "This feature was created by an automated E2E test.";

  /**
   * Helper to perform login and navigate to the app.
   */

  async function loginAndGoToApp(page: any, user: any) {
    // Navigate to the OpenCloud instance – it will redirect to the OIDC login page
    await page.goto("/");

    // Fill in credentials on the OIDC login form
    await page.fill("#oc-login-username", user.username);
    await page.fill("#oc-login-password", user.password);
    await page.getByRole("button", { name: "Log in" }).click();

    // Wait for the OIDC flow to complete – post-login lands at /files/spaces/...
    await page.waitForSelector("#oc-login-username", { state: "detached", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Navigate to the Feature Voting app
    await page.goto("/feature-voting/board", { waitUntil: "domcontentloaded" });

    // Wait for the app component to mount
    await expect(page.locator(".fv-container")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("h1")).toContainText("Feature Voting");
  }

  test("User Alpha creates a feature request", async ({ page }) => {
    await loginAndGoToApp(page, alphaUser);

    // Navigate to the submission form (separate route since NewFeature.vue extraction)
    await page.click("button.fv-btn-primary");
    await page.waitForURL(/.*\/feature-voting\/new/, { timeout: 15000 });

    // Fill the form
    await page.fill(
      'input[placeholder="Feature title (required)"]',
      featureTitle,
    );
    await page.fill(
      'textarea[placeholder="Describe the feature (optional)"]',
      featureDesc,
    );

    // Submit → redirects back to board
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/.*\/feature-voting\/board/, { timeout: 15000 });

    // Verify it appears in the list with auto-vote (creator gets 1 vote automatically)
    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await expect(featureItem).toBeVisible();
    await expect(featureItem.locator(".fv-vote-count")).toHaveText("1");
  });

  test("User Beta views and votes for the shared feature", async ({ page }) => {
    await loginAndGoToApp(page, betaUser);

    // Verify Beta sees Alpha's feature — confirms shared backend, not per-user isolation
    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await expect(featureItem).toBeVisible();

    // Beta votes (Alpha auto-voted = 1, Beta makes it 2)
    await featureItem.locator(".fv-vote-btn").click();

    // Verify vote count updated to 2 and card shows voted state
    await expect(featureItem.locator(".fv-vote-count")).toHaveText("2", {
      timeout: 5000,
    });
    await expect(featureItem).toHaveClass(/fv-voted/);
  });

  test("User Gamma votes for the shared feature", async ({ page }) => {
    await loginAndGoToApp(page, gammaUser);

    // Gamma votes (Alpha=1, Beta=2, Gamma=3)
    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await expect(featureItem).toBeVisible();

    await featureItem.locator(".fv-vote-btn").click();

    await expect(featureItem.locator(".fv-vote-count")).toHaveText("3", {
      timeout: 5000,
    });
  });

  test("User Alpha deletes their feature request", async ({ page }) => {
    // Handle the browser confirm dialog for deletion
    page.on("dialog", (dialog) => dialog.accept());

    await loginAndGoToApp(page, alphaUser);

    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await expect(featureItem).toBeVisible();
    // Alpha + Beta + Gamma = 3 total votes
    await expect(featureItem.locator(".fv-vote-count")).toHaveText("3");

    // The ··· trigger has opacity:0 until hover — hover to reveal it
    await featureItem.hover();
    await featureItem.locator(".fv-actions-trigger").click();

    // Wait for the dropdown to appear and click Delete
    await expect(featureItem.locator(".fv-actions-menu")).toBeVisible({ timeout: 3000 });
    await featureItem.locator(".fv-action-danger").click();

    // Verify the card is gone from the board
    await expect(featureItem).not.toBeVisible({ timeout: 8000 });
  });
});
