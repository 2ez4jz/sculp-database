const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('scripts/fixtures/communication-sdk.js','utf8')}));
  await page.goto('http://localhost:4173/');await page.getByRole('heading',{name:'业务工作台'}).waitFor();await page.locator('.w23-headline').waitFor();
  assert.equal(await page.locator('.auth-story').count(),0);
  for(const width of [1920,1440,1024,768,390,360,320]){
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
  const drop=async(target,items,enabled=true)=>{
   const transfer=await page.evaluateHandle(({items,png})=>{const data=new DataTransfer();for(const item of items){const bytes=item.size===undefined?Uint8Array.from(atob(png),c=>c.charCodeAt(0)):new Uint8Array(item.size);data.items.add(new File([bytes],item.name,{type:item.type||'image/png'}));}return data;},{items,png:png.toString('base64')});
   try{
    await target.dispatchEvent('dragenter',{dataTransfer:transfer});await target.locator('[data-text]').dispatchEvent('dragenter',{dataTransfer:transfer});
    await target.locator('[data-text]').dispatchEvent('dragleave',{dataTransfer:transfer});
    assert.equal(await target.evaluate(el=>el.classList.contains('is-file-dragging')),enabled,'nested drag events retain the drop highlight');
    const accepted=await target.evaluate((el,data)=>{const event=new DragEvent('dragover',{dataTransfer:data,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;},transfer);
    assert(accepted,'file dragover opts into handling the drop');
    const prevented=await target.evaluate((el,data)=>{const event=new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;},transfer);
    assert(prevented,'file drops never navigate the browser, including while saving');
    assert.equal(await target.evaluate(el=>el.classList.contains('is-file-dragging')),false);
   }finally{await transfer.dispose();}
  };
  const textPrevented=await panel.locator('[data-text]').evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','普通文字拖放');const event=new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;});assert.equal(textPrevented,false,'ordinary text drops remain native');
  await drop(panel,[{name:'wechat-fixture.png'},{name:'unsupported.txt',type:'text/plain'},{name:'instagram-fixture.png'},{name:'oversize.png',size:10000001},{name:'empty.png',size:0}]);
  await panel.getByText(/已添加 2 个附件.*3 个附件未添加/).waitFor();assert.equal(await panel.locator('[data-files] [data-remove]').count(),2);
  assert.equal(await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='sculpy_communication_command'&&c.args.p_action==='add_record').length),0,'dropping stages files without saving');
  await panel.locator('[data-upload]').setInputFiles([{name:'picker-fixture.png',mimeType:'image/png',buffer:png}]);await panel.getByText(/已添加 1 个附件/).waitFor();
  assert.equal(await panel.locator('[data-files] [data-remove]').count(),3,'picker and drop share the same staged list');
  await page.screenshot({path:'qa-screens/communication-drop-desktop.png',fullPage:true});
  await page.evaluate(()=>window.qaLoseNote=true);await panel.locator('[data-save]').click();await panel.getByText(/尚未收到保存确认/).waitFor();
  await drop(panel,[{name:'blocked-during-retry.png'}],false);await panel.getByText('请先重试保存当前记录，再添加附件。',{exact:true}).waitFor();assert.equal(await panel.locator('[data-files] [data-remove]').count(),3);
  await panel.locator('[data-save]').click();await panel.getByText(/云端共 2 条记录/).waitFor();
  const calls=await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='sculpy_communication_command'&&c.args.p_action==='add_record'));assert.equal(calls.length,2);assert.deepEqual(calls[0].args,calls[1].args);assert.equal(calls[0].args.p_payload.attachments.length,3);
  assert.equal(await panel.locator('[data-files] [data-remove]').count(),0);await panel.getByRole('button',{name:'▧ wechat-fixture.png',exact:true}).click();await panel.locator('img[alt="wechat-fixture.png"]').waitFor();
  await panel.locator('[data-ai]').click();await panel.locator('[data-review-form]').waitFor();await panel.locator('[name=needs]').fill('人工修订：全天服务需求，需确认覆盖时间。');await panel.locator('[name=approved]').check();await panel.getByRole('button',{name:'确认归档',exact:true}).click();await panel.getByText('已确认归档；原文完整保留。').waitFor();
  await panel.getByText('人工修订：全天服务需求，需确认覆盖时间。',{exact:true}).waitFor();
  for(const width of [1440,768,390,360,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Communication overflow at ${width}`);await page.screenshot({path:`qa-screens/v24-communication-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:'转为订单 · 核对客户与服务'}).click();await page.locator('[data-form]').waitFor();await page.locator('[data-form] [name=time]').fill('10:00');await page.locator('[data-form] [name=confirmed]').check();await page.locator('[data-form] button[type=submit]').click();await page.locator('[data-order-detail] .communication-panel').waitFor();await page.locator('[data-order-detail]').getByText('人工修订：全天服务需求，需确认覆盖时间。',{exact:true}).waitFor();
  const bookingPanel=page.locator('[data-order-detail] .communication-panel');await drop(bookingPanel,[{name:'booking-drop.png'}]);await bookingPanel.getByText(/已添加 1 个附件/).waitFor();await bookingPanel.locator('[data-save]').click();await bookingPanel.getByText(/云端共 3 条记录/).waitFor();
  await drop(bookingPanel,Array.from({length:21},(_,i)=>({name:`limit-${i}.png`})));await bookingPanel.getByText(/已添加 20 个附件.*1 个附件未添加/).waitFor();assert.equal(await bookingPanel.locator('[data-files] [data-remove]').count(),20);
  await bookingPanel.locator('[data-remove]').first().click();assert.equal(await bookingPanel.locator('[data-files] [data-remove]').count(),19);
  assert.deepEqual(errors,[]);console.log('Communication UI: 7 viewport widths, multi-image drag/drop in Lead and Booking, nested hover, native text drops, mixed invalid/oversize/empty files, picker coexistence, 20-file limit/removal, no auto-save, frozen retry payload, saved image preview, edited summary and retained conversion history passed. Model/storage/auth are fictional; database permissions tested separately.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
