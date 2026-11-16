const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:"export {createClient} from '/scripts/fixtures/os-foundation-sdk.js';"}));
  await page.goto('http://localhost:4173/?qa_pending=1');await page.locator('[data-os-metrics] dd').first().waitFor();
  await page.locator('[data-os-nav=crm]').click();await page.locator('[data-os-client-open]').click();await page.locator('[data-client-edit]').click();
  const client=page.locator('[data-client-edit-form]');await client.locator('[name=phone]').fill('+1 416 555 0200');
  await page.locator('[data-os-nav=settings]').click();await page.getByText('请先完成当前保存，再切换页面。',{exact:true}).waitFor();
  await page.locator('[data-client-review]').click();await page.locator('[data-client-review-panel]').waitFor({state:'visible'});
  await client.locator('[name=confirmed]').check();await page.evaluate(()=>{window.osLoseClientResponse=true;});await client.getByRole('button',{name:'确认保存客户资料'}).click();
  await client.getByRole('button',{name:'重试同一笔修改'}).waitFor();await client.getByRole('button',{name:'重试同一笔修改'}).click();
  await page.locator('[data-os-client-detail]').getByText('+1 416 555 0200',{exact:true}).waitFor();
  const edits=await page.evaluate(()=>window.osCalls.filter(x=>x.name==='sculpy_os_update_client'));assert.equal(edits.length,2);assert.deepEqual(edits[0].args,edits[1].args);
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`customer overflow ${width}`);await page.locator('[data-os-client-detail]').screenshot({path:`qa-screens/os32-customer-${width}.png`});}
  await page.locator('[data-os-nav=calendar]').click();await page.locator('[data-os-new-task]').click();const task=page.locator('[data-os-task-form]');
  await task.locator('[name=title]').fill('Delegated review');await task.locator('[name=dueOn]').fill('2026-12-01');await task.locator('[name=assignedTo]').selectOption('24000000-0000-4000-8000-000000000002');await task.locator('[name=confirmed]').check();
  await task.getByRole('button',{name:'确认添加任务'}).click();await task.getByText('已保存。',{exact:true}).waitFor();
  const created=await page.evaluate(()=>window.osCalls.filter(x=>x.name==='sculpy_os_create_task_v32').at(-1));assert.equal(created.args.p_assigned_to,'24000000-0000-4000-8000-000000000002');
  await page.locator('[data-task-edit]').click();const action=page.locator('[data-task-update]');await action.locator('[name=action]').selectOption('reassign');await action.locator('[name=assignee]').selectOption('24000000-0000-4000-8000-000000000002');await action.locator('[name=confirmed]').check();await action.getByRole('button',{name:'确认修改任务'}).click();
  await page.locator('[data-task-list]').getByText(/Miranda/).waitFor();await page.locator('[data-task-scope]').selectOption('mine');await page.locator('[data-task-list]').getByText('当前状态下没有任务。').waitFor();await page.locator('[data-task-scope]').selectOption('team');await page.locator('[data-task-edit]').waitFor();
  await page.locator('[data-os-nav=crm]').click();await page.locator('[data-import-panel] summary').click();
  const csv='external_id,display_name,email\nQA1,Imported One,one@example.test\nQA2,Imported Two,two@example.test\n';
  const file={name:'customers.csv',mimeType:'text/csv',buffer:Buffer.from(csv)};await page.locator('[data-import-file]').setInputFiles(file);await page.locator('[data-import-mapping]').waitFor({state:'visible'});
  await page.locator('[data-import-preview]').click();await page.locator('[data-import-summary]').getByText(/将新增 2 条/).waitFor();
  await page.locator('[data-import-confirmed]').check();await page.evaluate(()=>{window.osLoseImportResponse=true;});await page.locator('[data-import-save]').click();await page.getByRole('button',{name:'重试同一批次',exact:true}).waitFor();
  await page.locator('[data-os-nav=settings]').click();await page.getByText('请先完成当前保存，再切换页面。',{exact:true}).waitFor();await page.getByRole('button',{name:'重试同一批次',exact:true}).click();await page.locator('[data-import-status]').getByText(/当前批次已保存/).waitFor();
  const batches=await page.evaluate(()=>window.osCalls.filter(x=>x.name==='sculpy_os_import_commit'));assert.equal(batches.length,2);assert.deepEqual(batches[0].args,batches[1].args);
  await page.locator('[data-import-file]').setInputFiles(file);await page.locator('[data-import-preview]').click();await page.locator('[data-import-summary]').getByText(/将新增 0 条.*跳过 2 条/).waitFor();
  const large='external_id,display_name\n'+Array.from({length:205},(_,i)=>'Large'+i+',Customer '+i).join('\n');await page.locator('[data-import-file]').setInputFiles({name:'large.csv',mimeType:'text/csv',buffer:Buffer.from(large)});await page.locator('[data-import-batch]').selectOption('2');await page.locator('[data-import-preview]').click();await page.locator('[data-import-summary]').getByText(/将新增 5 条/).waitFor();
  const preview=await page.evaluate(()=>window.osCalls.filter(x=>x.name==='sculpy_os_import_preview').at(-1));assert.equal(preview.args.p_rows.length,5);assert.equal(preview.args.p_rows[0].line,202);
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`import overflow ${width}`);await page.locator('[data-os-import-root]').screenshot({path:`qa-screens/os32-import-${width}.png`});}
  assert.deepEqual(errors,[]);console.log('OS 3.2: customer editing/dirty guards/retry, task assignment/mine/team, CSV mapping/batches/dedup/retry and 3 widths passed with fictional transport.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
