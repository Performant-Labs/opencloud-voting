const { request } = require('@playwright/test');
(async () => {
  const req = await request.newContext({
    baseURL: 'https://cloud.opencloud.test',
    httpCredentials: { username: 'admin', password: 'admin' },
    extraHTTPHeaders: { 'Accept': 'application/json' },
    ignoreHTTPSErrors: true
  });
  const drivesRes = await req.get('/graph/v1.0/drives');
  const drivesData = await drivesRes.json();
  const projects = drivesData.value.filter(d => d.name === 'Feature Voting Data' && d.driveType === 'project');
  for (const p of projects) {
    console.log("Deleting project space:", p.id);
    const delRes = await req.delete('/graph/v1.0/drives/' + p.id);
    console.log(delRes.status());
  }
})();
