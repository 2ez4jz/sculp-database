const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:"export {createClient} from '/scripts/fixtures/os-foundation-sdk.js';"}));
  await page.goto('http://localhost:4173/?qa_pending=1');
  await page.locator('[data-os-metrics] dd').first().waitFor();
  assert.equal(await page.locator('[data-os-metrics] dd').count(),5);
  assert.equal(await page.locator('[data-os-nav]').count(),10);
  assert.equal(await page.locator('[data-os-metrics] dd').first().innerText(),'5');
  for(const width of [320,375,390,768,1440]){
   await page.setViewportSize({width,height:900});
   await page.locator('[data-os-nav=dashboard]').click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
   if(width<=760){
    await page.evaluate(()=>{window.scrollTo(0,700);return new Promise(requestAnimationFrame);});
    const nav=await page.locator('.studio-sidebar nav').boundingBox();
    assert(Math.abs(nav.y)<1,`mobile menu must remain at viewport top at ${width}`);
    assert(nav.height<90,'only the compact menu should stay pinned');
    assert(await page.locator('.studio-sidebar .auth-brand').evaluate(el=>el.getBoundingClientRect().bottom<0),'brand must scroll away');
    await page.locator('[data-os-nav=calendar]').click();
    const target=await page.locator('[data-os-calendar]').boundingBox();
    assert(target.y>=nav.height-1,'module target must not sit behind the menu');
    await page.locator('[data-os-nav=settings]').click();
    const heading=await page.locator('.studio-page-header').boundingBox();
    assert(heading.y>=nav.height-1,'settings heading must remain below the menu');
    await page.screenshot({path:`qa-screens/os-sticky-menu-${width}.png`});
    await page.locator('[data-os-nav=dashboard]').click();
   }
   await page.screenshot({path:`qa-screens/os-phase1-${width}.png`,fullPage:true});
  }
  await page.locator('[data-os-new-task]').click();
  const form=page.locator('[data-os-task-form]');
  await form.locator('[name=title]').fill('确认报价');await form.locator('[name=dueOn]').fill('2026-11-15');
  await form.locator('[name=confirmed]').check();
  await page.evaluate(()=>{window.osLoseResponse=true;});
  await form.getByRole('button',{name:'确认添加任务'}).click();
  await form.getByRole('button',{name:'重试同一笔操作'}).waitFor();
  await page.locator('[data-os-nav=crm]').click();await page.getByText('请先完成当前保存，再切换页面。',{exact:true}).waitFor();
  await form.getByRole('button',{name:'重试同一笔操作'}).click();
  await form.getByText('已保存。',{exact:true}).waitFor();
  const writes=await page.evaluate(()=>window.osCalls.filter(x=>x.name==='sculpy_os_create_task_v32'));
  assert.equal(writes.length,2);assert.deepEqual(writes[0].args,writes[1].args);
  await page.locator('[data-os-nav=calendar]').click();
  await page.locator('[data-task-edit]').click();
  const edit=page.locator('[data-task-update]');
  await edit.locator('[name=action]').selectOption('reschedule');await edit.locator('[name=dueOn]').fill('2026-12-01');await edit.locator('[name=confirmed]').check();
  await edit.getByRole('button',{name:'确认修改任务'}).click();await page.locator('[data-task-list]').getByText(/2026-12-01/).waitFor();
  await page.locator('[data-task-edit]').click();await edit.locator('[name=confirmed]').check();
  await page.evaluate(()=>{window.osLoseTaskResponse=true;});await edit.getByRole('button',{name:'确认修改任务'}).click();
  await edit.getByRole('button',{name:'重试同一笔修改'}).waitFor();
  await page.locator('[data-os-nav=crm]').click();await page.getByText('请先完成当前保存，再切换页面。',{exact:true}).waitFor();
  await edit.getByRole('button',{name:'重试同一笔修改'}).click();await page.locator('[data-task-list]').getByText('当前状态下没有任务。').waitFor();
  const updates=await page.evaluate(()=>window.osCalls.filter(x=>x.name==='sculpy_os_update_task'));assert.equal(updates.length,3);assert.deepEqual(updates[1].args,updates[2].args);
  await page.locator('[data-task-filter]').selectOption('done');await page.locator('[data-task-edit]').click();
  await edit.locator('[name=confirmed]').check();await edit.getByRole('button',{name:'确认修改任务'}).click();
  await page.locator('[data-task-filter]').selectOption('open');await page.locator('[data-task-edit]').click();
  await edit.locator('[name=action]').selectOption('cancel');await edit.locator('[name=confirmed]').check();await edit.getByRole('button',{name:'确认修改任务'}).click();
  await page.locator('[data-task-list]').getByText('当前状态下没有任务。').waitFor();
  await page.locator('[data-os-nav=crm]').click();await page.locator('[data-os-client-open]').click();
  await page.locator('[data-os-client-detail]').getByText('avery@example.test',{exact:true}).waitFor();
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`client overflow at ${width}`);
   await page.screenshot({path:`qa-screens/os31-client-${width}.png`,fullPage:true});
  }
  await page.locator('[data-client-task]').click();assert.equal(await form.locator('[name=clientId]').inputValue(),'24000000-0000-4000-8000-000000000041');
  await page.locator('[data-os-nav=marketing]').click();assert.equal(await page.locator('[data-os-marketing]').isVisible(),true);
  await page.locator('[data-os-nav=settings]').click();assert.equal(await page.locator('#cloud-workspace').isVisible(),false);
  await page.locator('[data-os-nav=dashboard]').click();assert.equal(await page.locator('#cloud-workspace').isVisible(),true);
  await page.evaluate(()=>{window.osReadError=true;});await page.locator('[data-os-refresh]').click();
  await page.getByText(/工作台数据暂不可用/).waitFor();assert.equal(await page.locator('[data-os-metrics] dd').count(),0);
  assert.deepEqual(errors,[]);
  console.log('OS 3.1: navigation, responsive client details, reschedule/complete/cancel/reopen, lost acknowledgment and existing flows passed with fictional transport.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
