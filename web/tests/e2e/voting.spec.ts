import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * OpenCloud Voting E2E Test Suite.
 * Cycles through multiple test users to verify collaborative functionality.
 *
 * Uses test.describe.serial because tests depend on each other:
 *   Alpha creates → Beta votes → Gamma votes → Alpha deletes
 */

// Load test users created in global setup
const usersPath = path.join(__dirname, 'test-users.json');
const testUsers = JSON.parse(fs.readFileSync(usersPath, 'utf8'));

test.describe.serial('Feature Voting App', () => {
  test.beforeAll(() => {
    if (!testUsers || testUsers.length < 3) {
      test.skip(true, 'Test users were not properly created in global setup.');
    }
  });

  const alphaUser = testUsers[0];
  const betaUser = testUsers[1];
  const gammaUser = testUsers[2];

  let featureId: string;
  const featureTitle = `E2E Test Feature ${Date.now()}`;
  const featureDesc = 'This feature was created by an automated E2E test.';

  /**
   * Helper to perform login and navigate to the app.
   */
  async function loginAndGoToApp(page: any, user: any) {
    // Navigate to the OpenCloud instance – it will redirect to the OIDC login page
    await page.goto('/');
    
    // Fill in credentials on the OIDC login form
    await page.fill('#oc-login-username', user.username);
    await page.fill('#oc-login-password', user.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    
    // Wait for the OIDC flow to complete – post-login lands at /files/spaces/...
    await page.waitForURL(/.*\/files\/.*/, { timeout: 30000 });
    
    // Navigate to the Feature Voting app
    await page.goto('/feature-voting/board');
    
    // Wait for the app component to mount
    await expect(page.locator('.fv-container')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Feature Voting');
  }

  test('User Alpha creates a feature request', async ({ page }) => {
    await loginAndGoToApp(page, alphaUser);

    // Fill the form
    await page.fill('input[placeholder="Feature title (required)"]', featureTitle);
    await page.fill('textarea[placeholder="Describe the feature (optional)"]', featureDesc);
    
    // Submit
    await page.click('button.fv-btn-primary');

    // Verify it appears in the list
    const featureItem = page.locator('.fv-item', { hasText: featureTitle });
    await expect(featureItem).toBeVisible();

    const alphaSpaceId = await page.locator('.fv-container').getAttribute('data-space-id');
    console.log("-> ALPHA space ID is:", alphaSpaceId);
    await expect(featureItem.locator('.fv-vote-count')).toHaveText('0');
  });

  test('User Beta views and votes for the shared feature', async ({ page }) => {
    await loginAndGoToApp(page, betaUser);

    const errorAttr = await page.locator('body').getAttribute('data-load-error');
    if (errorAttr) {
      throw new Error("UI Load Error: " + errorAttr);
    }

    const betaSpaceId = await page.locator('.fv-container').getAttribute('data-space-id');
    console.log("-> BETA space ID is:", betaSpaceId);

    // Verify Beta sees Alpha's feature (data is shared)
    const featureItem = page.locator('.fv-item', { hasText: featureTitle });
    await expect(featureItem).toBeVisible();
    
    // Beta votes
    await featureItem.locator('.fv-vote-btn').click();

    // Verify vote count updated to 1
    await expect(featureItem.locator('.fv-vote-count')).toHaveText('1');
    await expect(featureItem).toHaveClass(/fv-voted/);
  });

  test('User Gamma votes for the shared feature', async ({ page }) => {
    await loginAndGoToApp(page, gammaUser);

    // Gamma votes
    const featureItem = page.locator('.fv-item', { hasText: featureTitle });
    await expect(featureItem).toBeVisible();
    
    await featureItem.locator('.fv-vote-btn').click();

    // Verify vote count updated to 2
    await expect(featureItem.locator('.fv-vote-count')).toHaveText('2');
  });

  test('User Alpha deletes their feature request', async ({ page }) => {
    // Handle the browser confirm dialog for deletion
    page.on('dialog', dialog => dialog.accept());

    await loginAndGoToApp(page, alphaUser);

    const featureItem = page.locator('.fv-item', { hasText: featureTitle });
    await expect(featureItem).toBeVisible();
    await expect(featureItem.locator('.fv-vote-count')).toHaveText('2');

    // Click delete
    await featureItem.locator('.fv-delete-btn').click();

    // Verify it is gone
    await expect(featureItem).not.toBeVisible();
  });
});

