import { test, expect, request as playwrightRequest } from "@playwright/test";

/**
 * E2E tests for the inline commenting feature on feature cards.
 *
 * These tests manage their own user lifecycle via beforeAll/afterAll
 * so they are fully independent of the voting.spec.ts users.
 *
 * Flow:
 *   Alpha creates feature → Alpha posts comment → Beta sees comment →
 *   Beta posts comment → Alpha deletes own comment → Beta deletes own comment
 */

const BASE_URL = "https://cloud.opencloud.test";

const COMMENT_USERS = [
  {
    displayName: "Comment Alpha",
    username: "test_comment_alpha",
    password: "password123",
    email: "comment_alpha@example.com",
  },
  {
    displayName: "Comment Beta",
    username: "test_comment_beta",
    password: "password123",
    email: "comment_beta@example.com",
  },
];

async function getAdminContext() {
  return playwrightRequest.newContext({
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      Authorization: "Basic " + Buffer.from("admin:admin").toString("base64"),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}

async function loginAndGoToBoard(page: any, user: (typeof COMMENT_USERS)[0]) {
  await page.goto("/");
  await page.fill("#oc-login-username", user.username);
  await page.fill("#oc-login-password", user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/.*\/files\/.*/, { timeout: 30000 });
  await page.goto("/feature-voting/board");
  await expect(page.locator(".fv-container")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("h1")).toContainText("Feature Voting");
}

test.describe.serial("Comments", () => {
  const createdUserIds: string[] = [];
  const featureTitle = `Comment E2E Feature ${Date.now()}`;
  let commentAlphaText: string;
  let commentBetaText: string;

  test.beforeAll(async () => {
    const api = await getAdminContext();

    console.log("→ [comments] Creating comment test users...");
    for (const user of COMMENT_USERS) {
      // Idempotent: skip if user already exists
      const check = await api.get(`/graph/v1.0/users/${user.username}`);
      if (check.ok()) {
        const existing = await check.json();
        createdUserIds.push(existing.id);
        console.log(`  ${user.username} already exists (${existing.id})`);
        continue;
      }

      const res = await api.post("/graph/v1.0/users", {
        data: {
          accountEnabled: true,
          displayName: user.displayName,
          onPremisesSamAccountName: user.username,
          passwordProfile: {
            password: user.password,
            forceChangePasswordNextSignIn: false,
          },
        },
      });

      if (res.ok()) {
        const data = await res.json();
        createdUserIds.push(data.id);
        console.log(`  Created ${user.username} (${data.id})`);
      } else {
        console.error(
          `  Failed to create ${user.username}: ${res.status()} ${await res.text()}`,
        );
      }
    }

    await api.dispose();
  });

  test.afterAll(async () => {
    const api = await getAdminContext();

    console.log("→ [comments] Deleting comment test users...");
    for (const id of createdUserIds) {
      const res = await api.delete(`/graph/v1.0/users/${id}`);
      if (res.ok()) {
        console.log(`  Deleted user ID ${id}`);
      } else {
        console.error(
          `  Failed to delete user ID ${id}: ${res.status()}`,
        );
      }
    }

    await api.dispose();
  });

  test.beforeAll(() => {
    if (createdUserIds.length < 2) {
      test.skip(true, "Comment test users were not created — skipping.");
    }
  });

  const alphaUser = COMMENT_USERS[0];
  const betaUser = COMMENT_USERS[1];

  // ── Test 1: Alpha creates the feature ────────────────────────────────

  test("Alpha creates a feature to comment on", async ({ page }) => {
    await loginAndGoToBoard(page, alphaUser);

    // Navigate to the new-feature form
    await page.click("button.fv-btn-primary");
    await page.waitForURL(/.*\/feature-voting\/new/, { timeout: 15000 });

    await page.fill('input[placeholder="Feature title (required)"]', featureTitle);
    await page.fill(
      'textarea[placeholder="Describe the feature (optional)"]',
      "Feature created for comment E2E tests.",
    );
    await page.getByRole("button", { name: "Submit" }).click();

    // After submit it navigates back to board
    await page.waitForURL(/.*\/feature-voting\/board/, { timeout: 15000 });
    await expect(page.locator(".fv-item", { hasText: featureTitle })).toBeVisible();
  });

  // ── Test 2: Alpha opens the comment panel and posts a comment ─────────

  test("Alpha posts a comment on the feature", async ({ page }) => {
    await loginAndGoToBoard(page, alphaUser);

    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await expect(featureItem).toBeVisible();

    // Open comments
    await featureItem.locator(".fv-comments-toggle").click();
    await expect(featureItem.locator(".fv-comments")).toBeVisible();

    // Post a comment
    commentAlphaText = `Alpha's comment at ${Date.now()}`;
    await featureItem.locator(".fv-comment-input").fill(commentAlphaText);
    await featureItem.getByRole("button", { name: "Post" }).click();

    // Verify the comment appears with non-empty attribution
    const alphaComment = featureItem.locator(".fv-comment", {
      hasText: commentAlphaText,
    });
    await expect(alphaComment).toBeVisible();
    await expect(alphaComment.locator(".fv-comment-author")).not.toBeEmpty();

    // Toggle count should now show 1
    await expect(featureItem.locator(".fv-comments-toggle")).toContainText("1 comment");
  });

  // ── Test 3: Beta sees Alpha's comment and adds their own ──────────────

  test("Beta sees Alpha's comment and posts their own", async ({ page }) => {
    await loginAndGoToBoard(page, betaUser);

    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await expect(featureItem).toBeVisible();

    // Open comments
    await featureItem.locator(".fv-comments-toggle").click();
    await expect(featureItem.locator(".fv-comments")).toBeVisible();

    // Verify Alpha's comment is visible to Beta
    await expect(
      featureItem.locator(".fv-comment", { hasText: commentAlphaText }),
    ).toBeVisible();

    // Beta posts their own comment
    commentBetaText = `Beta's reply at ${Date.now()}`;
    await featureItem.locator(".fv-comment-input").fill(commentBetaText);
    await featureItem.getByRole("button", { name: "Post" }).click();

    // Verify Beta's comment appears
    await expect(
      featureItem.locator(".fv-comment", { hasText: commentBetaText }),
    ).toBeVisible();

    // Both comments visible, count is 2
    await expect(featureItem.locator(".fv-comments-toggle")).toContainText("2 comments");
  });

  // ── Test 4: Alpha deletes their own comment ───────────────────────────

  test("Alpha deletes their own comment", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    await loginAndGoToBoard(page, alphaUser);

    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await featureItem.locator(".fv-comments-toggle").click();
    await expect(featureItem.locator(".fv-comments")).toBeVisible();

    const alphaComment = featureItem.locator(".fv-comment", {
      hasText: commentAlphaText,
    });
    await expect(alphaComment).toBeVisible();

    // Hover to reveal the delete button, then click
    await alphaComment.hover();
    await alphaComment.locator(".fv-comment-delete").click();

    // Alpha's comment is gone; Beta's remains
    await expect(alphaComment).not.toBeVisible();
    await expect(
      featureItem.locator(".fv-comment", { hasText: commentBetaText }),
    ).toBeVisible();

    await expect(featureItem.locator(".fv-comments-toggle")).toContainText("1 comment");
  });

  // ── Test 5: Beta deletes their own comment ────────────────────────────

  test("Beta deletes their own comment", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    await loginAndGoToBoard(page, betaUser);

    const featureItem = page.locator(".fv-item", { hasText: featureTitle });
    await featureItem.locator(".fv-comments-toggle").click();
    await expect(featureItem.locator(".fv-comments")).toBeVisible();

    const betaComment = featureItem.locator(".fv-comment", {
      hasText: commentBetaText,
    });
    await expect(betaComment).toBeVisible();

    await betaComment.hover();
    await betaComment.locator(".fv-comment-delete").click();

    await expect(betaComment).not.toBeVisible();
    await expect(featureItem.locator(".fv-comments")).toContainText("No comments yet.");
    await expect(featureItem.locator(".fv-comments-toggle")).toContainText("0 comments");
  });
});
