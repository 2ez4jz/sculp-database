const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('scripts/fixtures/communication-sdk.js','utf8')}));
  await page.goto('http://localhost:4173/');await page.getByRole('heading',{name:'业务工作台'}).waitFor();await page.locator('.w23-headline').waitFor();
  assert.equal(await page.locator('.auth-story').count(),0);
  for(const width of [1920,1440,1024,768,390,360]){
   await page.setViewportSize({width,height:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Workspace overflow at ${width}`);
   if(width>=1440){assert((await page.locator('.auth-workspace').boundingBox()).width>1000);assert.equal(await page.locator('.w23-section').first().evaluate(el=>getComputedStyle(el.parentElement).gridTemplateColumns.split(' ').length),2);}
   await page.screenshot({path:`qa-screens/v24-workspace-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:/Fictional Avery · 1 条待整理/}).click();await page.locator('.communication-panel [data-text]').waitFor();
  const panel=page.locator('.communication-panel').first();
  await panel.locator('[data-text]').fill('虚构记录：客户从半天改为全天，价格待确认。');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jltkAAAAASUVORK5CYII=','base64');
  await panel.locator('[data-upload]').setInputFiles([{name:'wechat-fixture.png',mimeType:'image/png',buffer:png},{name:'instagram-fixture.png',mimeType:'image/png',buffer:png}]);
  await page.evaluate(()=>window.qaLoseNote=true);await panel.locator('[data-save]').click();await panel.getByText(/尚未收到保存确认/).waitFor();
  await panel.locator('[data-save]').click();await panel.getByText(/云端共 2 条记录/).waitFor();
  const calls=await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='sculpy_communication_command'&&c.args.p_action==='add_record'));assert.equal(calls.length,2);assert.deepEqual(calls[0].args,calls[1].args);assert.equal(calls[0].args.p_payload.attachments.length,2);
  await panel.locator('[data-ai]').click();await panel.locator('[data-review-form]').waitFor();await panel.locator('[name=needs]').fill('人工修订：全天服务需求，需确认覆盖时间。');await panel.locator('[name=approved]').check();await panel.getByRole('button',{name:'确认归档',exact:true}).click();await panel.getByText('已确认归档；原文完整保留。').waitFor();
  await panel.getByText('人工修订：全天服务需求，需确认覆盖时间。',{exact:true}).waitFor();
  for(const width of [1440,768,390,360]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Communication overflow at ${width}`);await page.screenshot({path:`qa-screens/v24-communication-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:'转为订单 · 核对客户与服务'}).click();await page.locator('[data-form]').waitFor();await page.locator('[data-form] [name=time]').fill('10:00');await page.locator('[data-form] [name=confirmed]').check();await page.locator('[data-form] button[type=submit]').click();await page.locator('[data-order-detail] .communication-panel').waitFor();await page.locator('[data-order-detail]').getByText('人工修订：全天服务需求，需确认覆盖时间。',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('V24 UI: 6 viewport widths, full desktop frame, multiple image uploads, lost acknowledgment retry, edited summary, conversion history retained. Model/storage/auth are mocked; database permissions tested separately.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
