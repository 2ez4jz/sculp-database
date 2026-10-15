const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('memora-demo-language','zh'));
  await page.route('**/functions/v1/sculpy-chat',async route=>{
   const b=route.request().postDataJSON();
   await route.fulfill({json:{turn:{id:b.requestId,user:b.message,answer:'页面切换测试回复。',references:[],proposals:[],sourceIds:[],modelProfile:{model:'test-backend-model'},engine:'sdk'}}});
  });
  const go=async route=>{
   await page.evaluate(r=>location.hash=r,route);
   await page.waitForFunction(r=>document.querySelector('#main')?.dataset.route==='#'+r,route);
  };
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   await page.setViewportSize(viewport);
   await page.goto('http://localhost:4173/?demo=1#dashboard');
   await page.locator('#sculpy-dashboard .analysis-card').first().waitFor();
   assert.equal(await page.locator('#sculpy-dashboard .analysis-card').count(),3);
   assert.equal(await page.locator('#sculpy-chat-root').count(),0);
   assert.equal(await page.locator('#nav a.active').getAttribute('href'),'#dashboard');
   await page.locator('[name=from]').fill('2026-08-01');
   await page.locator('[name=to]').fill('2026-09-30');
   await page.locator('[data-dashboard-dates] button[type=submit]').click();
   assert.equal(await page.locator('#sculpy-dashboard .analysis-card').count(),3);
   for(const scope of await page.locator('#sculpy-dashboard .analysis-scope').allTextContents())assert(scope.includes('2026-08-01 → 2026-09-30'));
   await page.locator('[name=from]').fill('2026-10-01');
   await page.locator('[data-dashboard-dates] button[type=submit]').click();
   await page.locator('[data-dashboard-date-error]:visible').waitFor();
   assert((await page.locator('.analysis-scope').first().innerText()).includes('2026-08-01 → 2026-09-30'));
   await page.locator('[name=from]').fill('2026-08-01');
   await page.locator('[data-dashboard-dates] button[type=submit]').click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const overview=await page.locator('#sculpy-dashboard').innerText();
   assert.notEqual(await page.locator('#nav a[href="#sculpy"]').evaluate(el=>getComputedStyle(el).color),'rgba(0, 0, 0, 0)','assistant navigation label must be readable');
   await go('sculpy');await page.locator('#chat-input:not(:disabled)').waitFor();
   assert.equal(await page.locator('#sculpy-dashboard').count(),0);
   assert.equal(await page.locator('.chat-launcher:visible').count(),0);
   const composer=await page.locator('[data-send]').boundingBox();
   assert(composer.y>=0&&composer.y+composer.height<=viewport.height,'composer must fit viewport');
   const count=await page.locator('.chat-assistant').count();
   await page.locator('#chat-input').fill('页面切换测试');await page.locator('#chat-input').press('Enter');
   await page.waitForFunction(n=>document.querySelectorAll('.chat-assistant').length===n+1&&!document.querySelector('#chat-input').disabled,count);
   assert.equal(await page.locator('.chat-model-status').getAttribute('data-ai-state'),'ready');
   assert((await page.locator('.chat-model-status').innerText()).includes('test-backend-model'));
   await go('dashboard');assert.equal(await page.locator('#sculpy-dashboard').innerText(),overview);
   await go('sculpy');assert.equal(await page.locator('.chat-assistant').count(),count+1);
   assert.equal(await page.locator('.chat-model-status').getAttribute('data-ai-state'),'idle');
   await page.reload();await page.locator('#chat-input:not(:disabled)').waitFor();
   assert.equal(await page.locator('.chat-assistant').count(),count+1);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:'qa-screens/separate-sculpy-'+viewport.width+'.png'});
  }
  await page.selectOption('#role','artist');await go('dashboard');
  assert.equal(await page.locator('#sculpy-dashboard .analysis-card').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Separate dashboard/chat: desktop, mobile composer, history, refresh and role isolation passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
