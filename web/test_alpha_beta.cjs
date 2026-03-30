const { request } = require("@playwright/test");

(async () => {
  // Alpha
  const alphaContext = await request.newContext({
    baseURL: "https://cloud.opencloud.test",
    httpCredentials: { username: "test_user_alpha", password: "password!123" },
    extraHTTPHeaders: { Accept: "application/json" },
    ignoreHTTPSErrors: true,
  });

  const alphaDrivesRes = await alphaContext.get("/graph/v1.0/drives");
  const alphaDrives = await alphaDrivesRes.json();
  const alphaSpace = alphaDrives.value.find(
    (d) =>
      d.driveType === "project" && d.name.startsWith("Feature Voting Data"),
  );
  if (!alphaSpace) {
    console.error("Alpha found no project space:", alphaDrives);
    return;
  }
  const spaceId = alphaSpace.id;
  console.log("Alpha space ID:", spaceId);

  const davUrl = `/dav/spaces/${spaceId}/feature-votes.json`;
  const putRes = await alphaContext.put(davUrl, {
    data: JSON.stringify({
      features: ["TEST FEATURE MANUALLY PUT"],
      votes: {},
    }),
    headers: { "Content-Type": "application/json" },
  });
  console.log("Alpha PUT status:", putRes.status(), await putRes.text());

  // Beta
  const betaContext = await request.newContext({
    baseURL: "https://cloud.opencloud.test",
    httpCredentials: { username: "test_user_beta", password: "password!123" },
    extraHTTPHeaders: { Accept: "application/json" },
    ignoreHTTPSErrors: true,
  });

  const getRes = await betaContext.get(davUrl);
  console.log("Beta GET status:", getRes.status());
  console.log("Beta GET body:", await getRes.text());
})();
