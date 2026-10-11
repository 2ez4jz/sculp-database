const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {bookings}=await import('../src/data/demo.js');
 const {demoReport}=await import('../supabase/functions/sculpy-chat/demo-report.js');
 const args={from:'2026-09-01',to:'2026-09-30',service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:'service'};
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('memora-demo-language','zh'));
  await page.route('**/functions/v1/sculpy-chat',async route=>{
   const b=route.request().postDataJSON();
   const patches=b.message.includes('对比')?[{from:'2026-08-01',to:'2026-08-31'},{}]:b.message.includes('排期')?[{}]:[{}];
   await route.fulfill({json:{turn:{id:b.requestId,user:b.message,answer:'9月订单状态与完成金额分析。',references:[],proposals:[],sourceIds:[],demoReportSources:patches.map(p=>demoReport(bookings,{...args,...p},'2026-10-11'))}}});
  });
  await page.goto('http://localhost:4173/?demo=1#sculpy');
  const send=async q=>{await page.locator('#chat-input:not(:disabled)').waitFor();await page.locator('#chat-input').fill(q);await page.locator('#chat-input').press('Enter');await page.locator('#chat-input:not(:disabled)').waitFor();};
  await send('9月日报');await page.locator('.analysis-donut').waitFor();
  const last=()=>page.locator('.chat-assistant').last();
  assert.equal(await last().locator('.analysis-card').count(),4);
  assert.match(await last().innerText(),/订单目前走到哪一步/);
  await last().scrollIntoViewIfNeeded();await page.screenshot({path:'qa-screens/analysis-daily-desktop.png'});
  await send('8月和9月收入对比');assert.equal(await last().locator('.analysis-line').count(),1);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await last().scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await last().evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await last().locator('.analysis-card').first().evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:'qa-screens/analysis-trend-mobile.png'});
  await send('9月排期');assert.equal(await last().locator('.analysis-schedule-row').count(),12);
  await last().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'qa-screens/analysis-schedule-mobile.png'});
  await page.reload();await page.locator('#chat-input:not(:disabled)').waitFor();assert(await page.locator('.analysis-line').count());
  const preview=await browser.newPage({viewport:{width:390,height:1100}});
  for(const kind of ['donut','trend','schedule']){const html=await page.locator('[data-analysis-chart="'+kind+'"]').first().evaluate(el=>el.outerHTML);await preview.setContent('<link rel="stylesheet" href="http://localhost:4173/src/components/chat/panel.css"><div style="padding:12px;font-family:Arial,sans-serif">'+html+'</div>');await preview.waitForTimeout(150);await preview.screenshot({path:'qa-screens/analysis-'+kind+'-card-mobile.png'});}
  await preview.close();
  await page.selectOption('#role','artist');await page.evaluate(()=>location.hash='sculpy');await page.waitForFunction(()=>document.querySelector('#main')?.dataset.route==='#sculpy');await page.locator('#chat-input:not(:disabled)').waitFor();
  await send('9月收入饼图');assert.equal(await page.locator('.analysis-card').count(),0);
  assert.deepEqual(errors,[]);console.log('Automatic charts: exact daily report, desktop/mobile, trend, schedule, history and role isolation passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
