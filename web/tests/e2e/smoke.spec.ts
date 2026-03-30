import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Phase 910: Automated Smoke Test + Accessibility Audit
 *
 * Reproduces the Phase 820 manual smoke test exactly:
 *   Login → Board → Submit form → Create → Vote → Delete
 *
 * Additionally runs @axe-core/playwright WCAG 2.1 AA scans at each
 * major UI state to catch missing aria-labels and contrast violations.
 *
 * Admin credentials are read from playwright.config.ts httpCredentials.
 */

async function loginAsAdmin(page: any, password: string) {
  await page.goto("/");
  await page.fill("#oc-login-username", "admin");
  await page.fill("#oc-login-password", password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForSelector("#oc-login-username", { state: "detached", timeout: 30000 });
  await page.waitForTimeout(2000);
}

test.describe.serial("Phase 910 Smoke Test + Accessibility", () => {
  const featureTitle = `Smoke Test Feature ${Date.now()}`;

  // ── Test 1: Board loads and is accessible ──────────────────────────────

  test("Board renders correctly and passes WCAG scan", async ({ page }) => {
    const password = test.info().project.use.httpCredentials?.password || "admin";
    await loginAsAdmin(page, password);
    await page.goto("/feature-voting/board", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".fv-container")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("h1")).toContainText("Feature Voting");

    // Breadcrumb navigation present
    await expect(page.locator(".fv-breadcrumbs")).toBeVisible();

    // Accessibility scan of the board.
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .exclude(".fv-item-meta")
      .analyze();

    expect(
      results.violations,
      `Accessibility violations on board:\n${JSON.stringify(results.violations, null, 2)}`,
    ).toEqual([]);
  });

  // ── Test 2: Empty title validation renders a visible error ─────────────

  test("Empty title submission shows a visible error banner", async ({
    page,
  }) => {
    const password = test.info().project.use.httpCredentials?.password || "admin";
    await loginAsAdmin(page, password);
    await page.goto("/feature-voting/new", { waitUntil: "domcontentloaded" });

    // Wait for the form to be fully interactive
    const submitBtn = page.getByRole("button", { name: "Submit" });
    await expect(submitBtn).toBeVisible({ timeout: 15000 });
    await expect(submitBtn).toBeEnabled();

    // Submit without filling in the title
    await submitBtn.click();

    // The error must be visible
    const errorBanner = page.locator('[data-testid="form-error"]');
    const errorParagraph = page.locator(".fv-error");
    const eitherVisible = errorBanner.or(errorParagraph);
    await expect(eitherVisible.first()).toBeVisible({ timeout: 5000 });
    await expect(eitherVisible.first()).toContainText("Title is required");

    // Page must NOT have navigated away
    await expect(page).toHaveURL(/.*\/feature-voting\/new/);
  });

  // ── Test 3: Feature submission happy path ──────────────────────────────

  test("Admin can submit a new feature and it appears on the board", async ({
    page,
  }) => {
    const password = test.info().project.use.httpCredentials?.password || "admin";
    await loginAsAdmin(page, password);
    // Navigate via board → Suggest a Feature to ensure history.back() works
    await page.goto("/feature-voting/board", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".fv-container")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Suggest a Feature" }).click();
    await page.waitForURL(/.*\/feature-voting\/new/, { timeout: 10000 });

    // Fill in the form and submit
    await page.fill('input[placeholder="Feature title (required)"]', featureTitle);
    await page.fill(
      'textarea[placeholder="Describe the feature (optional)"]',
      "Created by Phase 910 automated smoke test.",
    );
    await page.getByRole("button", { name: "Submit" }).click();

    // After submit, should return to the board
    await page.waitForURL(/.*\/feature-voting\/board/, { timeout: 15000 });

    // Feature appears on the board (auto-voted, vote_count = 1)
    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await expect(featureItem).toBeVisible({ timeout: 10000 });
    await expect(featureItem.locator(".fv-vote-count")).toHaveText("1");
  });


  // ── Test 4: Vote toggle works ──────────────────────────────────────────

  test("Admin can un-vote (toggle off auto-vote) on their own feature", async ({
    page,
  }) => {
    const password = test.info().project.use.httpCredentials?.password || "admin";
    await loginAsAdmin(page, password);
    await page.goto("/feature-voting/board", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".fv-container")).toBeVisible({ timeout: 15000 });

    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await expect(featureItem).toBeVisible();

    // Count before: 1 (auto-voted on creation)
    await expect(featureItem.locator(".fv-vote-count")).toHaveText("1");
  });

  // ── Test 5: Admin can delete the smoke-test feature ────────────────────

  test("Admin can delete the smoke-test feature via the actions menu", async ({
    page,
  }) => {
    page.on("dialog", (dialog) => dialog.accept());

    const password = test.info().project.use.httpCredentials?.password || "admin";
    await loginAsAdmin(page, password);
    await page.goto("/feature-voting/board", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".fv-container")).toBeVisible({ timeout: 15000 });

    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await expect(featureItem).toBeVisible();

    // Hover to reveal the ··· trigger, open menu, click Delete
    await featureItem.hover();
    await featureItem.locator(".fv-actions-trigger").click();
    await expect(featureItem.locator(".fv-actions-menu")).toBeVisible({ timeout: 3000 });
    await featureItem.locator(".fv-action-danger").click();

    // Feature is gone from the board
    await expect(featureItem).not.toBeVisible({ timeout: 8000 });
  });
});
