const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const users = JSON.parse(fs.readFileSync("tests/e2e/test-users.json"));
  const user = users[0];

  await page.goto("https://cloud.opencloud.test");
  await page.fill('input[name="username"]', user.username);
  await page.click('button[type="submit"]');
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  const drives = await page.evaluate(async () => {
    const res = await fetch("/graph/v1.0/drives");
    return await res.json();
  });
  console.log(JSON.stringify(drives, null, 2));
  await browser.close();
})();
