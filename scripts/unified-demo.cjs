const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{localStorage.setItem('memora-demo-language','zh');if(!sessionStorage.getItem('initialized')){localStorage.setItem('sculp-memory-demo-v1','{"demoBookings":[{"id":"old24"}]}');localStorage.setItem('sculpy-chat-v1:admin','old24');sessionStorage.setItem('initialized','yes')}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let body;
 await page.route('**/functions/v1/sculpy-chat',route=>{body=route.request().postDataJSON();return route.fulfill({json:{turn:{id:body.requestId,user:body.message,answer:'300单虚构数据已核对',references:[],proposals:[],sourceIds:[]}}})});
 await page.goto('http://localhost:4173/?demo=1#bookings');
 await page.locator('[data-demo-data-notice]').waitFor();
 assert.match(await page.locator('[data-demo-data-notice]').innerText(),/当前 300 单/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('sculp-memory-demo-v1')),null);
 await page.goto('http://localhost:4173/?demo=1#bookings/b0');
 await page.locator('#demo-order-editor summary').click();
 const form=page.locator('[data-demo-edit]');
 await form.locator('[name=price]').fill('123.45');await form.locator('[name=paidAmount]').fill('50.25');await form.locator('[name=paidDate]').fill('2027-01-10');await form.locator('[name=channelId]').selectOption('google');await form.locator('[name=reason]').fill('300单完整闭环测试');
 await form.locator('button[type=submit]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sculp-memory-demo-300-v2')||'{}').bookingOverrides?.b0),undefined);
 await page.locator('[data-demo-confirm]').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('sculp-memory-demo-300-v2')||'{}').bookingOverrides?.b0?.price===123.45);
 await page.reload();await page.locator('#demo-order-editor summary').click();assert.equal(await page.locator('[name=price]').inputValue(),'123.45');
 await page.goto('http://localhost:4173/?demo=1#insights');
 const receipt=page.locator('[data-monthly-analytics] tr').filter({hasText:'2027-01'});assert.match(await receipt.innerText(),/50.25/);
 await page.goto('http://localhost:4173/?demo=1#sculpy');await page.locator('#chat-input').fill('分析这300单的金额和渠道');await page.locator('[data-send]').click();
 await page.waitForFunction(()=>document.body.innerText.includes('300单虚构数据已核对'));
 assert.equal(body.mode,'demo');assert.equal(body.catalog.bookings.length,300);assert.equal(body.catalog.bookings.find(b=>b.id==='b0').price,123.45);assert.equal(body.advisorFixture.summary.total,300);assert.equal(body.advisorFixture.version,'sculp-unified-300-v2');assert(Buffer.byteLength(JSON.stringify(body))<180000);
 await page.goto('http://localhost:4173/?demo=1#settings');page.on('dialog',d=>d.accept());await page.locator('[data-action=reset]').click();await page.goto('http://localhost:4173/?demo=1#bookings/b0');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sculp-memory-demo-300-v2')||'{}').bookingOverrides),undefined);
 assert.match(await page.locator('[data-demo-data-notice]').innerText(),/当前 300 单/);
 await page.selectOption('#role','artist');await page.selectOption('#artistIdentity','yuki');await page.goto('http://localhost:4173/?demo=1#bookings');assert.equal(await page.locator('#demo-order-editor').count(),0);
 assert.deepEqual(errors,[]);console.log('Unified 300: delete old state, review, save, reload, actual receipt month, AI current catalog, payload limit, reset and employee scope passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
