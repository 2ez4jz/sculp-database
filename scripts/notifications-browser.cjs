const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
 await context.route('**/src/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('scripts/fixtures/communication-sdk.js','utf8')}));
 await context.addInitScript(()=>{
  window.qaPermission='default';window.qaSubscribeCalls=0;window.qaUnsubscribeCalls=0;
  Object.defineProperty(window,'Notification',{configurable:true,value:class Notification{static get permission(){return window.qaPermission;}static requestPermission(){throw Error('Unrequested permission API');}}});
  Object.defineProperty(window,'PushManager',{configurable:true,value:class PushManager{}});
  let sub=null;const reg={pushManager:{getSubscription:async()=>sub,subscribe:()=>{
   if(!navigator.userActivation.isActive)throw Error('Subscribe lost the direct user gesture');window.qaSubscribeCalls++;window.qaPermission='granted';
   sub={endpoint:'https://fcm.googleapis.com/fcm/send/FICTIONAL-browser',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'B'.repeat(87),auth:'C'.repeat(22)}};},async unsubscribe(){window.qaUnsubscribeCalls++;sub=null;return true;}};return Promise.resolve(sub);
  }},getNotifications:async()=>[]};
  const worker=new EventTarget();worker.ready=Promise.resolve(reg);worker.getRegistration=async()=>reg;worker.register=async()=>reg;
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:worker});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4173/');await page.getByRole('heading',{name:'业务工作台',exact:true}).waitFor();
 assert.equal(await page.locator('[data-enable]').count(),0,'no notification switch on the home screen');assert.equal(await page.evaluate(()=>window.qaSubscribeCalls),0);
 await page.locator('#workspace-settings').click();await page.getByRole('heading',{name:'通知设置',exact:true}).waitFor();
 const settings=page.locator('#notification-settings');await page.waitForFunction(()=>!document.querySelector('[data-enable]').disabled);
 assert.equal(await page.evaluate(()=>window.qaSubscribeCalls),0,'opening Settings does not request permission');
 assert.equal(await settings.locator('[name=quiet_enabled],[name=quiet_start]').count(),0);
 await settings.getByRole('button',{name:'开启此设备推送',exact:true}).click();await settings.getByText('此设备已开启推送，可以发送一条测试通知。',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.qaSubscribeCalls),1);assert.equal(await settings.locator('[data-permission]').innerText(),'已允许');
 await settings.getByRole('button',{name:'发送测试通知',exact:true}).click();await settings.getByText(/测试通知已排队/).waitFor();await settings.getByText('推送服务已接收',{exact:true}).waitFor();
 await settings.locator('[name=overdue]').uncheck();await settings.getByRole('button',{name:'保存通知偏好',exact:true}).click();await settings.getByText('通知偏好已保存。',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.qaPushCalls.filter(c=>c.action==='preferences').at(-1).data.overdue),false);
 await settings.locator('[data-global] [name=repeatHours]').selectOption('24');await settings.getByRole('button',{name:'保存全局规则',exact:true}).click();await settings.getByText('全局提醒规则已保存。',{exact:true}).waitFor();
 await page.screenshot({path:'qa-screens/notifications-desktop.png',fullPage:true});
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:'qa-screens/notifications-mobile.png',fullPage:true});
 await settings.getByRole('button',{name:'关闭此设备',exact:true}).click();await settings.getByText('此设备推送已关闭。',{exact:true}).waitFor();assert(await settings.locator('[data-test]').isDisabled());
 const owner=await context.newPage();await owner.goto('http://localhost:4173/?qa_role=owner');await owner.locator('#workspace-settings').click();await owner.getByRole('heading',{name:'通知设置',exact:true}).waitFor();assert.equal(await owner.locator('#notification-settings [data-global]').count(),0);
 const staff=await context.newPage();await staff.goto('http://localhost:4173/?qa_role=artist');await staff.locator('#workspace-settings').click();await staff.getByRole('heading',{name:'通知设置',exact:true}).waitFor();assert.equal(await staff.locator('#notification-settings [name=new_enquiry],#notification-settings [name=overdue],#notification-settings [data-global]').count(),0);
 const linked=await context.newPage();await linked.goto('http://localhost:4173/?notification=35000000-0000-4000-8000-000000000201');await linked.locator('.communication-panel').waitFor();assert(await linked.locator('#website-enquiries> [data-list] details').first().getAttribute('open')!==null);
 assert.deepEqual(errors,[]);console.log('V25 notification settings: no unsolicited prompt/home switch; direct user activation, preference/device/test/history controls, no quiet hours, operations-only global config, staff boundaries, deep link and 320/390/768px layout passed. Push/Auth transport is fictional; real iPhone delivery is not asserted.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
