import { request, FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Global teardown to cleanup test users.
 * Admin credentials come from playwright.config.ts → use.httpCredentials.
 */
async function globalTeardown(config: FullConfig) {
  const { baseURL, httpCredentials } = config.projects[0].use;
  const username = httpCredentials?.username || "admin";
  const password = httpCredentials?.password || "admin";

  const requestContext = await request.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      Authorization:
        "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
    },
  });

  const usersPath = path.join(__dirname, "test-users.json");
  if (!fs.existsSync(usersPath)) {
    console.log("  No test-users.json found. Skipping cleanup.");
    return;
  }

  const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));

  console.log("→ Cleaning up test users via Graph API...");

  for (const user of users) {
    if (user.id) {
      const res = await requestContext.delete(`/graph/v1.0/users/${user.id}`);
      if (res.ok()) {
        console.log(`  Deleted user: ${user.username} (ID: ${user.id})`);
      } else {
        console.error(
          `  Failed to delete user ${user.username} (ID: ${user.id}): ${res.status()}`,
        );
      }
    }
  }

  fs.unlinkSync(usersPath);
  console.log("→ Cleaned up test user data.");

  await requestContext.dispose();
}

export default globalTeardown;
