import { test, expect, request as playwrightRequest } from "@playwright/test";

/**
 * E2E test: Vote Targeting Accuracy
 *
 * Verifies that when multiple features exist on the board, clicking the
 * vote button on one feature only affects THAT feature's vote count —
 * not any other feature's count.
 *
 * This test catches the "wrong feature upvoted" bug where list re-sorting
 * after an optimistic update causes a visual mismatch between the clicked
 * item and the feature that actually receives the vote.
 *
 * Uses 2 users:
 *   Alpha creates 3 features → Beta votes on the MIDDLE one →
 *   verify only the middle one's count changed
 */

const BASE_URL = "https://cloud.opencloud.test";

const VOTE_TARGET_USERS = [
  {
    displayName: "VoteTarget Alpha",
    username: "test_votetarget_alpha",
    password: "password123",
    email: "votetarget_alpha@example.com",
  },
  {
    displayName: "VoteTarget Beta",
    username: "test_votetarget_beta",
    password: "password123",
    email: "votetarget_beta@example.com",
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

async function loginAndGoToBoard(
  page: any,
  user: (typeof VOTE_TARGET_USERS)[0],
) {
  await page.goto("/");
  await page.fill("#oc-login-username", user.username);
  await page.fill("#oc-login-password", user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/.*\/files\/.*/, { timeout: 30000 });
  await page.goto("/feature-voting/board");
  await expect(page.locator(".fv-container")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("h1")).toContainText("Feature Voting");
}

test.describe.serial("Vote Targeting Accuracy", () => {
  const createdUserIds: string[] = [];

  // Use unique timestamps to ensure features are distinguishable
  const ts = Date.now();
  const featureTitles = [
    `VT First Feature ${ts}`,
    `VT Middle Feature ${ts}`,
    `VT Last Feature ${ts}`,
  ];

  const alphaUser = VOTE_TARGET_USERS[0];
  const betaUser = VOTE_TARGET_USERS[1];

  // ── Setup: create test users ──────────────────────────────────────────

  test.beforeAll(async () => {
    const api = await getAdminContext();

    console.log("→ [vote-targeting] Creating test users...");
    for (const user of VOTE_TARGET_USERS) {
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

  // ── Teardown: delete test users ───────────────────────────────────────

  test.afterAll(async () => {
    const api = await getAdminContext();

    console.log("→ [vote-targeting] Deleting test users...");
    for (const id of createdUserIds) {
      const res = await api.delete(`/graph/v1.0/users/${id}`);
      if (res.ok()) {
        console.log(`  Deleted user ID ${id}`);
      } else {
        console.error(`  Failed to delete user ID ${id}: ${res.status()}`);
      }
    }

    await api.dispose();
  });

  test.beforeAll(() => {
    if (createdUserIds.length < 2) {
      test.skip(true, "Vote targeting test users were not created — skipping.");
    }
  });

  // ── Test 1: Alpha creates 3 features ─────────────────────────────────

  test("Alpha creates 3 features", async ({ page }) => {
    await loginAndGoToBoard(page, alphaUser);

    for (const title of featureTitles) {
      // Navigate to the new-feature form
      await page.click("button.fv-btn-primary");
      await page.waitForURL(/.*\/feature-voting\/new/, { timeout: 15000 });

      await page.fill(
        'input[placeholder="Feature title (required)"]',
        title,
      );
      await page.fill(
        'textarea[placeholder="Describe the feature (optional)"]',
        `Created for vote targeting test.`,
      );
      await page.getByRole("button", { name: "Submit" }).click();

      // After submit it navigates back to board
      await page.waitForURL(/.*\/feature-voting\/board/, { timeout: 15000 });
      await expect(
        page.locator(".fv-item", { hasText: title }),
      ).toBeVisible();
    }

    // Verify all 3 are visible with correct initial vote counts.
    // Auto-vote gives the creator 1 vote on each.
    for (const title of featureTitles) {
      const item = page.locator(".fv-item", { hasText: title });
      await expect(item).toBeVisible();
      await expect(item.locator(".fv-vote-count")).toHaveText("1");
    }
  });

  // ── Test 2: Beta votes on the MIDDLE feature only ─────────────────────

  test("Beta votes on the middle feature and only its count changes", async ({
    page,
  }) => {
    await loginAndGoToBoard(page, betaUser);

    const middleTitle = featureTitles[1]; // "VT Middle Feature ..."

    // Capture initial vote counts for ALL features
    const initialCounts: Record<string, string> = {};
    for (const title of featureTitles) {
      const item = page.locator(".fv-item", { hasText: title });
      await expect(item).toBeVisible();
      const count = await item.locator(".fv-vote-count").textContent();
      initialCounts[title] = count || "0";
    }

    console.log("→ Initial vote counts:", initialCounts);

    // Beta clicks vote on the MIDDLE feature
    const middleItem = page.locator(".fv-item", { hasText: middleTitle });
    await middleItem.locator(".fv-vote-btn").click();

    // Wait for the optimistic update + server reconciliation
    await expect(middleItem.locator(".fv-vote-count")).toHaveText("2", {
      timeout: 5000,
    });

    // Now verify ALL features have the expected counts:
    // - First feature: still 1 (unchanged)
    // - Middle feature: 2 (was 1, now +1)
    // - Last feature: still 1 (unchanged)
    const afterCounts: Record<string, { expected: string; label: string }> = {
      [featureTitles[0]]: { expected: "1", label: "First (should be unchanged)" },
      [featureTitles[1]]: { expected: "2", label: "Middle (should be +1)" },
      [featureTitles[2]]: { expected: "1", label: "Last (should be unchanged)" },
    };

    for (const [title, { expected, label }] of Object.entries(afterCounts)) {
      const item = page.locator(".fv-item", { hasText: title });
      const actualCount = await item.locator(".fv-vote-count").textContent();
      console.log(`→ ${label}: expected=${expected}, actual=${actualCount}`);
      await expect(item.locator(".fv-vote-count")).toHaveText(expected);
    }

    // Verify the middle item is marked as voted by Beta
    await expect(middleItem).toHaveClass(/fv-voted/);
  });

  // ── Test 3: Beta un-votes and verify it only affects the middle ───────

  test("Beta un-votes and only the middle feature count decreases", async ({
    page,
  }) => {
    await loginAndGoToBoard(page, betaUser);

    const middleTitle = featureTitles[1];
    const middleItem = page.locator(".fv-item", { hasText: middleTitle });

    // Middle should currently show 2 and be in voted state
    await expect(middleItem.locator(".fv-vote-count")).toHaveText("2");
    await expect(middleItem).toHaveClass(/fv-voted/);

    // Un-vote
    await middleItem.locator(".fv-vote-btn").click();

    // Wait for count to drop back to 1
    await expect(middleItem.locator(".fv-vote-count")).toHaveText("1", {
      timeout: 5000,
    });

    // Verify all other features are still at 1
    for (const title of featureTitles) {
      const item = page.locator(".fv-item", { hasText: title });
      await expect(item.locator(".fv-vote-count")).toHaveText("1");
    }

    // Middle should no longer be in voted state for Beta
    await expect(middleItem).not.toHaveClass(/fv-voted/);
  });

  // ── Test 4: Clean up — delete features via admin API ────────────────────

  test("Clean up: delete all 3 features via admin API", async ({ page }) => {
    // Log in as Alpha to read feature IDs from the DOM
    await loginAndGoToBoard(page, alphaUser);

    const featureIds: string[] = [];
    for (const title of featureTitles) {
      const item = page.locator(".fv-item", { hasText: title });
      await expect(item).toBeVisible();
      const featureId = await item.getAttribute("data-feature-id");
      expect(featureId).toBeTruthy();
      featureIds.push(featureId!);
    }

    // Use admin API context to delete (avoids OIDC token issues)
    const api = await getAdminContext();
    for (const id of featureIds) {
      const res = await api.delete(`/api/voting/features/${id}`);
      // Admin may get 204 or 403 (not owner) depending on backend policy.
      // Either way, the afterAll user teardown will cascade-delete.
      console.log(`  Delete feature ${id}: ${res.status()}`);
    }
    await api.dispose();
  });
});
