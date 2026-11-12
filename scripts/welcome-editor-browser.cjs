const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
  await context.route('**/src/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('scripts/fixtures/communication-sdk.js','utf8')}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:4173/');await page.getByRole('button',{name:'编辑欢迎语',exact:true}).click();
  const panel=page.locator('#welcome-editor'),input=panel.getByRole('textbox',{name:'欢迎语',exact:true}),account=panel.getByLabel('欢迎语所属账户');
  await input.waitFor();await page.waitForFunction(()=>!document.querySelector('#welcome-editor textarea').disabled);
  assert(await page.locator('.studio-header-actions #manage-accounts').isVisible());
  await account.selectOption('24000000-0000-4000-8000-000000000002');
  assert.equal(await input.inputValue(),'欢迎最美化妆师Miranda亲临工作室指导工作');
  const custom='欢迎 Miranda，今天也要闪闪发光 <img src=x onerror=alert(1)>';
  await input.fill(custom);assert.equal(await panel.locator('[data-preview]').innerText(),custom);assert.equal(await panel.locator('[data-preview] img').count(),0);
  await panel.getByRole('button',{name:'保存欢迎语',exact:true}).click();await panel.getByText('已保存到云端，其他设备刷新后生效。',{exact:true}).waitFor();
  const owner=await context.newPage();await owner.goto('http://localhost:4173/?qa_role=owner&qa_username=sculp_miranda');
  await owner.getByRole('heading',{name:custom,exact:true}).waitFor();assert.equal(await owner.locator('#edit-welcome,#welcome-editor').count(),0);assert.equal(await owner.locator('.studio-page-header h2 img').count(),0);
  await page.reload();await page.getByRole('button',{name:'编辑欢迎语',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#welcome-editor textarea').disabled);
  await input.fill('欢迎 JZ 回到工作室');await panel.getByRole('button',{name:'保存欢迎语',exact:true}).click();await page.getByRole('heading',{name:'欢迎 JZ 回到工作室',exact:true}).waitFor();
  await page.evaluate(()=>{window.qaLoseWelcome=true;});await input.fill('网络重试后的欢迎语');
  await panel.getByRole('button',{name:'保存欢迎语',exact:true}).click();await panel.getByText('尚未收到保存确认，请重试同一笔保存。',{exact:true}).waitFor();assert(await input.isDisabled());
  await panel.getByRole('button',{name:'重试保存',exact:true}).click();await panel.getByText('已保存到云端，其他设备刷新后生效。',{exact:true}).waitFor();assert(await input.isEnabled());
  await page.evaluate(()=>{window.qaFailWelcomeRead=true;});await input.fill('保存成功但读取中断');await panel.getByRole('button',{name:'保存欢迎语',exact:true}).click();await panel.getByText('已保存；重新读取暂时失败，可稍后读取最新内容。',{exact:true}).waitFor();assert(await input.isEnabled());
  await page.evaluate(()=>{window.qaWelcomeConflict=true;});await input.fill('尚未覆盖的本地草稿');await panel.getByRole('button',{name:'保存欢迎语',exact:true}).click();await panel.getByText(/其他设备已修改这句欢迎语/).waitFor();assert.equal(await input.inputValue(),'尚未覆盖的本地草稿');
  await panel.getByRole('button',{name:'读取最新内容',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#welcome-editor textarea').value==='另一台设备的新欢迎语');
  await input.fill('');await panel.getByRole('button',{name:'保存欢迎语',exact:true}).click();await page.getByRole('heading',{name:'业务工作台',exact:true}).waitFor();
  await account.selectOption('24000000-0000-4000-8000-000000000002');await input.fill('欢迎最美化妆师Miranda亲临工作室指导工作');await panel.getByRole('button',{name:'保存欢迎语',exact:true}).click();await panel.getByText('已保存到云端，其他设备刷新后生效。',{exact:true}).waitFor();
  await page.screenshot({path:'qa-screens/welcome-editor-desktop.png',fullPage:false});
  for(const width of [320,390,768]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await panel.getByRole('button',{name:'保存欢迎语',exact:true}).isVisible());}
  await page.screenshot({path:'qa-screens/welcome-editor-phone.png',fullPage:false});
  assert.deepEqual(errors,[]);console.log('Welcome editor: operations-only controls, safe text preview, cloud adapter save/readback, refreshed profile, empty default, lost acknowledgment retry, confirmed-save/read-failure, conflict draft retention and 320/390/768px overflow checks passed. Auth/storage adapter is fictional; server authorization is tested separately.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
