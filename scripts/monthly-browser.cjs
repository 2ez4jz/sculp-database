const {chromium}=require("playwright");
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",args:["--no-sandbox"]});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  let request;
  await page.route("**/functions/v1/sculpy-chat", async route => {
    request=route.request().postDataJSON();
    await route.fulfill({json:{turn:{id:request.requestId,user:request.message,answer:"AI 探索性分析：这是300条隔离虚构记录的在线顾问回答。",references:[],proposals:[],sourceIds:[]}}});
  });
  await page.goto("http://localhost:4173/?demo=1#sculpy");
  await page.locator("#chat-input").waitFor();
  await page.locator("#chat-input").fill("过去三个月收入和订单变化，分析一下");
  await page.locator("[data-send]").click();
  await page.locator(".sculpy-monthly-chart").waitFor();
  const t=await page.locator(".chat-answer").last().innerText();
  assert.equal(request.advisorFixture.summary.total,300);
  const {generateAdvisorFixtures}=await import("../src/data/advisor-fixtures.js");
  const {advisorMetrics}=await import("../src/domain/advisor-engine.js");
  const september=advisorMetrics(generateAdvisorFixtures(),{month:"2026-09"});
  assert.match(await page.locator(".sculpy-monthly-chart").innerText(),new RegExp((september.completedCents/100).toLocaleString("en-CA")));
  assert.match(t,/AI 探索性分析/);
  assert.match(await page.locator(".sculpy-monthly-chart").innerText(),/2026-09/);
  await page.goto("http://localhost:4173/?demo=1#insights");
  await page.locator("[data-monthly-analytics]").waitFor();
  console.log("monthly chat visualization and Insights integration passed");
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
