import { request, FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Global setup to create test users.
 */
async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const requestContext = await request.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      Authorization: "Basic " + Buffer.from("admin:admin").toString("base64"),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const users = [
    {
      displayName: "Test Alpha",
      username: "test_user_alpha",
      password: "password123",
      email: "alpha@example.com",
    },
    {
      displayName: "Test Beta",
      username: "test_user_beta",
      password: "password123",
      email: "beta@example.com",
    },
    {
      displayName: "Test Gamma",
      username: "test_user_gamma",
      password: "password123",
      email: "gamma@example.com",
    },
  ];

  console.log("→ Creating test users via Graph API...");

  const createdUsers: any[] = [];

  for (const user of users) {
    // Check if user exists first to be idempotent
    const checkRes = await requestContext.get(
      `/graph/v1.0/users/${user.username}`,
    );
    if (checkRes.ok()) {
      const existingUser = await checkRes.json();
      console.log(
        `  User ${user.username} already exists (ID: ${existingUser.id}).`,
      );
      createdUsers.push({ ...user, id: existingUser.id });
      continue;
    }

    const res = await requestContext.post("/graph/v1.0/users", {
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
      const userData = await res.json();
      console.log(`  Created user: ${user.username} (ID: ${userData.id})`);
      createdUsers.push({ ...user, id: userData.id });
    } else {
      const errorText = await res.text();
      console.error(
        `  Failed to create user ${user.username}: ${res.status()} ${errorText}`,
      );
    }
  }

  // Save users to a file for tests to consume
  const usersPath = path.join(__dirname, "test-users.json");
  fs.writeFileSync(usersPath, JSON.stringify(createdUsers, null, 2));
  console.log(`→ Saved ${createdUsers.length} users to ${usersPath}`);

  await requestContext.dispose();
}

export default globalSetup;

