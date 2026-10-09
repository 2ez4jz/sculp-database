const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
 const page=await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('memora-demo-language','zh'));const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4173/');await page.locator('#login-form').waitFor();
 await page.evaluate(async()=>{
  document.body.innerHTML='<main id="test-root"></main>';
  const {mountCloudIntake}=await import('/src/pages/login/intake.js');
  window.calls=[];window.saved=0;window.loseResponse=true;
  window.intake=mountCloudIntake({root:document.querySelector('#test-root'),supabase:{rpc:async(name,args)=>{
   if(name==='sculpy_intake_lookup')return {data:{clients:args.p_name==='Existing'?[{id:'client1',display_name:'Existing',city:'Toronto'}]:[],services:[{id:'service1',code:'wedding',name:'Wedding'}],artists:[]}};
   window.calls.push(args);window.saved=1;
   if(window.loseResponse){window.loseResponse=false;throw Error('Network failed')}
   return {data:{bookingId:'booking1',clientId:'client1',savedAt:new Date().toISOString()}};
  }},onSaved:async id=>{window.reloaded=id}});
 });
 await page.locator('summary').click();
 const raw='  Amy 的原文\n预算1800，需要妈妈妆。  ';
 await page.locator('[data-source]').fill(raw);await page.locator('[data-manual]').click();await page.locator('[data-form]').waitFor();
 assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.locator('[name=clientName]').fill('Amy');await page.locator('[data-match]').click();
 await page.locator('[name=date]').fill('2026-11-15');await page.locator('[name=time]').fill('07:00');await page.locator('[name=serviceId]').selectOption('service1');await page.locator('[name=budget]').fill('1800');
 await page.locator('[name=confirmed]').check();await page.locator('[type=submit]').click();
 await page.getByRole('button',{name:'重试同一笔保存'}).waitFor();
 assert.equal(await page.locator('[data-source]').isDisabled(),true);
 await page.getByRole('button',{name:'重试同一笔保存'}).click();await page.getByText('已保存并重新读取云端订单。其他设备登录后可查询。').waitFor();
 const result=await page.evaluate(()=>({calls:window.calls,reloaded:window.reloaded,saved:window.saved}));
 assert.equal(result.saved,1);assert.equal(result.calls.length,2);assert.deepEqual(result.calls[0],result.calls[1]);assert.equal(result.calls[0].p_raw_text,raw);assert.equal(result.reloaded,'booking1');
 await page.locator('[data-new]').click();assert.equal(await page.locator('[data-source]').inputValue(),'');
 // Changing source invalidates an old proposal.
 await page.locator('[data-source]').fill('新原文');await page.locator('[data-manual]').click();await page.locator('[data-form]').waitFor();await page.locator('[data-source]').fill('已改口');assert.equal(await page.locator('[data-form]').count(),0);
 await page.locator('[data-manual]').click();await page.locator('[data-form]').waitFor();await page.locator('[name=clientName]').fill('Existing');await page.locator('[data-match]').click();await page.getByText(/找到 1 位同名客户/).waitFor();assert.equal(await page.locator('[name=clientId]').inputValue(),'');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'qa-screens/cloud-intake-mobile.png',fullPage:true});
 await page.evaluate(async()=>{
  window.intake.destroy();
  const {mountCloudWorkspace}=await import('/src/pages/login/workspace.js');
  const booking={id:'order1',client:'QA Amy',service:'Wedding',starts_at:'2026-11-15T12:00:00Z',artists:[],venue:'Markham',status:'inquiry',budget_cad:1800,service_details:'新娘妆与妈妈妆'};
  const supabase={rpc:async(name)=>({data:{bookings:[booking],total:1,intake:name==='sculpy_order_detail'?{rawText:'  <script>unsafe</script> 原文  ',recordedAt:'2026-10-08T15:00:00Z',savedAt:'2026-10-08T15:01:00Z'}:undefined}}),from:()=>({select:()=>({eq:()=>({single:async()=>({data:{content:''}})})})})};
  window.workspace=mountCloudWorkspace({root:document.querySelector('#test-root'),supabase,profile:{id:'owner',role:'operations'}});
 });
 await page.locator('[data-booking=order1]').click();await page.locator('[data-order-detail]').getByText('预算：1800 CAD · 成交价：未确定').waitFor();
 await page.locator('[data-order-detail] summary').click();assert.equal(await page.locator('[data-order-detail] pre').textContent(),'  <script>unsafe</script> 原文  ');assert.equal(await page.locator('[data-order-detail] script').count(),0);
 await page.evaluate(()=>window.workspace.destroy());
 assert.deepEqual(errors,[]);console.log('Cloud intake UI passed: confirmation, retry identity, source invalidation, explicit matching, mobile layout.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
