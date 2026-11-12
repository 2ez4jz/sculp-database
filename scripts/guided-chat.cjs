const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('memora-demo-language','zh'));
  const requests=[];
  const report={source:'current_fictional_demo_full_catalog',fictional:true,filters:{from:'2026-01-01',to:'2026-10-15',service:'Wedding',channelId:null,artistId:null,bookingId:null,status:null,groupBy:'venue'},completed:3,completedAmountCents:300000,grossReceivedCents:300000};
  const answer='今年A场地每单平均更高。\n\n| 时间 | 场地 | 每单平均 |\n|---|---|---|\n| 今年 | A | CAD 1,000.00 |\n| 全部历史 | B | CAD 5,250.00 |\n\n### 怎么看\nB的历史平均数被一笔旧大单拉高，不能当作今年的表现。\n\n- A今年可以先看看，但要比较相同套餐。\n- B的一笔高价订单不代表每个客人都愿意多花钱。\n\n建议先看B那笔旧订单是不是服务了更多人，再决定要不要重点找这类新客人。';
  await page.route('**/functions/v1/sculpy-chat',async route=>{const body=route.request().postDataJSON();requests.push(body);await route.fulfill({json:{turn:{id:body.requestId,user:body.message,answer,references:[],proposals:[],sourceIds:[],modelProfile:{model:'test-model'},demoReportSources:[report]}}});});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.goto('http://localhost:4173/?demo=1#sculpy');
   await page.locator('#chat-input:not(:disabled)').waitFor();
   await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('sculpy-chat-300-v2:'))localStorage.removeItem(key);});
   await page.reload();await page.locator('#chat-input:not(:disabled)').waitFor();
   const before=requests.length;
   await page.locator('#chat-input').fill('哪个场地婚礼客单价最高');await page.locator('[data-send]').click();
   await page.locator('#chat-input:not(:disabled)').waitFor();
   assert.equal(requests.length,before+1);assert.equal(await page.locator('[data-followup]').count(),2);
   assert(await page.locator('.response-reasoning').first().isVisible());
   assert.match(await page.locator('.response-reasoning').first().innerText(),/旧大单/);
   assert.equal(await page.locator('.response-details[open]').count(),0);
   assert.match(await page.locator('.response-table:visible').first().innerText(),/5,250.00/);
   await page.locator('#chat-input').fill('我的草稿');await page.locator('[data-followup]').first().click();
   assert.equal(await page.locator('#chat-input').inputValue(),'我的草稿');assert.equal(requests.length,before+1);
   await page.locator('#chat-input').fill('');await page.locator('[data-followup]').first().click();
   await page.locator('#chat-input:not(:disabled)').waitFor();
   assert.equal(requests.length,before+2);assert.match(requests.at(-1).message,/沿用刚才/);
   assert.equal(requests.at(-1).turns.length,1);assert.equal(await page.locator('[data-followup]').count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:'qa-screens/guided-chat-'+viewport.width+'.png'});
  }
  assert.deepEqual(errors,[]);console.log('Guided chat: visible reasoning, two bounded suggestions, draft preservation, context, no auto requests and mobile layout passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
