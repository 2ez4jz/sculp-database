const assert=require('node:assert/strict');
module.exports=async function verifyCloudWrites(page,fixture){
 async function business(mode){
  await page.evaluate(async({detail,mode})=>{
   window.business?.destroy();window.leads?.destroy();window.dash?.destroy();window.workspace?.destroy();
   document.body.innerHTML='<main id="test-root"></main>';
   window.calls=[];window.saved=false;window.mode=mode;
   const {mountBookingBusiness}=await import('/src/pages/login/booking-business.js');
   window.business=mountBookingBusiness({root:document.querySelector('#test-root'),bookingId:detail.bookingId,
    supabase:{rpc:async(name,args)=>{
     if(name==='sculpy_wedding_detail')return {data:detail};
     window.calls.push({name,args});
     if(window.mode==='40001'||window.mode==='42501')return {error:{code:window.mode,message:'Changed elsewhere'}};
     return {data:{bookingId:detail.bookingId}};
    }},onSaved:async()=>{window.saved=true;if(mode==='read-failed')throw Error('Read failed');}});
  },{detail:fixture.detail,mode});
  const form=page.locator('[data-business-form]');await form.waitFor();
  await form.locator('[name=action]').selectOption('record_payment');await form.locator('[name=amount]').fill('50');
  await form.locator('[name=reason]').fill('Fictional reliability test');await form.locator('[name=confirmed]').check();
  await form.getByRole('button',{name:'确认保存',exact:true}).click();
 }
 // A successful write followed by a failed read is still a successful write.
 await business('read-failed');await page.getByText(/已保存，但重新读取失败/).waitFor();
 assert.equal(await page.evaluate(()=>window.business.canLeave()),true);
 await page.locator('[data-business-form]').evaluate(f=>f.dispatchEvent(new Event('submit',{cancelable:true})));
 assert.equal(await page.evaluate(()=>window.calls.length),1,'Acknowledged payment must never be resubmitted');
 for(const code of ['40001','42501']){
  await business(code);await page.getByText(/按最新权限和内容核对/).waitFor();
  assert.equal(await page.evaluate(()=>window.business.canLeave()),true);
  assert.equal(await page.getByRole('button',{name:'重试同一笔操作'}).count(),0);
  await page.locator('[data-business-form]').evaluate(f=>f.dispatchEvent(new Event('submit',{cancelable:true})));
  assert.equal(await page.evaluate(()=>window.calls.length),1);
 }
 // Losing a lead acknowledgment cannot be cleared by refresh, filter or new lead.
 await page.evaluate(async()=>{
  window.business.destroy();document.body.innerHTML='<main id="test-root"></main>';window.calls=[];window.loseResponse=true;
  const {mountWebsiteEnquiries}=await import('/src/pages/login/enquiries.js');
  const supabase={rpc:async(name,args)=>{
   window.calls.push({name,args});if(window.loseResponse){window.loseResponse=false;throw Error('客户日期已提交但连接中断');}
   if(window.commandCode)return {error:{code:window.commandCode,message:'Lead changed'}};
   return {data:{leadId:'fictional',revision:2}};
  },from:()=>{const q={select:()=>q,in:()=>q,eq:()=>q,order:()=>q,limit:()=>q,then:resolve=>Promise.resolve({data:[]}).then(resolve)};return q;}};
  window.leads=mountWebsiteEnquiries({root:document.querySelector('#test-root'),supabase});
 });
 await page.getByRole('button',{name:'手动新增询盘'}).click();
 let lead=page.locator('[data-new] form');await lead.locator('[name=name]').fill('Fictional lead');
 await lead.locator('[name=contact]').fill('fictional_wechat');await lead.locator('[name=reason]').fill('Fictional evidence');
 await lead.locator('[name=confirmed]').check();await lead.getByRole('button',{name:'保存询盘'}).click();
 await lead.getByText(/未收到成功确认/).waitFor();assert.equal(await page.evaluate(()=>window.leads.canLeave()),false);
 await page.getByRole('button',{name:'刷新',exact:true}).click();await page.locator('[data-filter]').selectOption('all');
 assert.equal(await page.locator('[data-filter]').inputValue(),'open');
 await page.getByRole('button',{name:'手动新增询盘'}).click();
 assert.equal(await lead.locator('[name=name]').inputValue(),'Fictional lead');
 await lead.getByRole('button',{name:'保存询盘'}).click();await page.waitForFunction(()=>window.leads.canLeave());
 const retries=await page.evaluate(()=>window.calls);assert.equal(retries.length,2);assert.deepEqual(retries[0],retries[1]);
 // A conflict releases the navigation guard but freezes the stale form.
 await page.getByRole('button',{name:'手动新增询盘'}).click();lead=page.locator('[data-new] form');
 await lead.locator('[name=name]').fill('Fictional conflict');await lead.locator('[name=contact]').fill('fictional');
 await lead.locator('[name=reason]').fill('Fictional evidence');await lead.locator('[name=confirmed]').check();
 await page.evaluate(()=>window.commandCode='40001');await lead.getByRole('button',{name:'保存询盘'}).click();
 await lead.getByText(/请刷新询盘/).waitFor();assert.equal(await page.evaluate(()=>window.leads.canLeave()),true);
 assert.equal(await lead.locator('[data-save-lead]').isDisabled(),true);
 await page.getByRole('button',{name:'刷新',exact:true}).click();
 // Workspace includes intake and enquiries in its leave guard; removes hook on destroy.
 await page.evaluate(async()=>{
  window.leads.destroy();document.body.innerHTML='<main id="test-root"></main>';window.loseResponse=true;
  const {mountCloudWorkspace}=await import('/src/pages/login/workspace.js');
  const supabase={rpc:async(name)=>{
   if(name==='sculpy_context')return {data:{bookings:[],total:0}};
   if(name==='sculpy_wedding_report')return {data:null,error:{message:'Fictional empty report'}};
   if(name==='sculpy_wedding_command')throw Error('Lost acknowledgment');
   throw Error('Unexpected RPC '+name);
  },from:()=>{const q={select:()=>q,in:()=>q,eq:()=>q,order:()=>q,limit:()=>q,single:()=>q,then:resolve=>Promise.resolve({data:[]}).then(resolve)};return q;}};
  window.workspace=mountCloudWorkspace({root:document.querySelector('#test-root'),supabase,profile:{id:'fixture-owner',role:'owner'}});
 });
 await page.getByRole('button',{name:'手动新增询盘'}).click();lead=page.locator('[data-new] form');
 await lead.locator('[name=name]').fill('Fictional pending');await lead.locator('[name=contact]').fill('fictional');
 await lead.locator('[name=reason]').fill('Fictional evidence');await lead.locator('[name=confirmed]').check();
 await lead.getByRole('button',{name:'保存询盘'}).click();await lead.getByText(/未收到成功确认/).waitFor();
 assert.equal(await page.evaluate(()=>window.workspace.canLeave()),false);
 assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),true);
 assert.equal(await page.evaluate(()=>{window.workspace.destroy();const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),false);
 console.log('Cloud write reliability passed: acknowledged payment/read failure, stale/denied command, lead exact retry and refresh/filter/new guards, workspace unload cleanup.');
};
