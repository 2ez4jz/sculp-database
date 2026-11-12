import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountOsFoundation,osNavigation} from '../src/pages/login/os-foundation.js';
const snapshot=()=>({asOf:'2026-11-12T18:00:00Z',today:'2026-11-12',pendingEnquiries:5,todayTasks:1,overdueTasks:0,weekBookings:2,unfinishedOrders:3,receivableCents:'12345',receivableUnknown:1,
 tasks:[{id:'t',reason:'<img src=x onerror=alert(1)>',due_at:'2026-11-12T23:00:00Z'}],taskCount:1,
 followups:[{id:'l',name:'<script>alert(1)</script>',status:'pending'}],followupCount:1,
 upcoming:[{id:'b',order_number:'612356',client:'QA',starts_at:'2026-11-13T14:00:00Z',status:'confirmed'}]});
async function waitFor(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,2));}assert.fail('DOM state did not settle');}
function setup(rpc,role='owner'){
 const dom=new JSDOM('<!doctype html><main id="root"></main>',{url:'https://fixture.test'});
 const prior={document:globalThis.document};globalThis.document=dom.window.document;
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 const root=document.querySelector('#root'),calls=[];
 const defaultRpc=async(name,args)=>{
  calls.push({name,args});
  if(rpc){const r=await rpc(name,args);if(r!==undefined)return r;}
  if(name==='sculpy_os_overview')return {data:snapshot()};
  if(name==='sculpy_os_clients')return {data:{total:1,clients:[{id:'c',display_name:'QA',order_count:2}]}};
  return {data:{id:args.p_id}};
 };
 const app=mountOsFoundation({root,supabase:{rpc:defaultRpc},profile:{role},onOrder:()=>{},onLead:()=>{},onNewOrder:()=>{}});
 return {dom,root,calls,app,close(){app.destroy();Object.assign(globalThis,prior);dom.window.close();}};
}
const submit=(dom,form)=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
test('OS DOM: real-data rendering, XSS escaping, 9 navigation targets and employee isolation',async()=>{
 const x=setup();try{
  await waitFor(()=>x.root.querySelector('[data-os-metrics]').children.length===5);
  assert.match(x.root.querySelector('[data-os-metrics]').textContent,/CA\$123.45/);
  assert.equal(x.root.querySelector('[data-os-today] img'),null);
  assert.equal(x.root.querySelector('[data-os-followups] script'),null);
  assert.equal(osNavigation.length,9);assert.equal(new Set(osNavigation.map(x=>x[0])).size,9);
  assert.equal(x.root.querySelector('[data-os-marketing]').hidden,true);
 }finally{x.close();}
 const staff=setup(null,'artist');try{assert.equal(staff.root.childElementCount,0);assert.equal(staff.calls.length,0);}finally{staff.close();}
});
test('OS DOM: permission/missing-migration failure clears old metrics and no Demo fallback',async()=>{
 let fail=false;const x=setup(name=>name==='sculpy_os_overview'&&fail?{error:{code:'42501'}}:undefined);
 try{await waitFor(()=>x.root.querySelector('[data-os-metrics]').children.length===5);fail=true;await x.app.refresh();
  assert.equal(x.root.querySelector('[data-os-metrics]').children.length,0);
  assert.match(x.root.querySelector('[data-os-status]').textContent,/暂不可用/);
  assert.doesNotMatch(x.root.textContent,/300 单/);
 }finally{x.close();}
});
test('OS DOM: lost response retries identical request, guards navigation, acknowledgment survives refresh failure',async()=>{
 let tries=0,failRefresh=false;const x=setup((name,args)=>{
  if(name==='sculpy_os_create_task'){tries++;if(tries===1)throw Error('lost acknowledgment');return {data:{id:args.p_id}};}
  if(failRefresh&&name==='sculpy_os_overview')return {error:{code:'offline'}};
 });
 try{
  await waitFor(()=>x.root.querySelector('[data-os-metrics]').children.length===5);
  x.app.openTask({bookingId:'b',label:'QA booking'});
  const form=x.root.querySelector('[data-os-task-form]');form.elements.title.value='Follow up';form.elements.dueOn.value='2026-11-13';form.elements.confirmed.checked=true;
  submit(x.dom,form);await waitFor(()=>form.textContent.includes('重试同一笔操作'));
  assert.equal(x.app.canLeave(),false);assert.equal(form.elements.title.disabled,true);
  x.app.openTask({clientId:'another'});assert.equal(form.elements.bookingId.value,'b');
  failRefresh=true;submit(x.dom,form);await waitFor(()=>x.app.canLeave());
  await waitFor(()=>x.root.querySelector('[data-os-status]').textContent.includes('暂不可用'));
  const writes=x.calls.filter(c=>c.name==='sculpy_os_create_task');assert.equal(writes.length,2);assert.deepEqual(writes[0].args,writes[1].args);
  assert.equal(form.querySelector('[data-os-write-result]').textContent,'已保存。');
  assert.equal(form.elements.title.disabled,false);assert.equal(form.elements.title.value,'');
 }finally{x.close();}
});
test('OS DOM: stale responses cannot overwrite refreshed data or a changed client query',async()=>{
 let resolveFirst,slow=false;const x=setup(name=>{
  if(name==='sculpy_os_overview'&&slow)return new Promise(r=>{resolveFirst=r;});
 });
 try{
  await waitFor(()=>x.root.querySelector('[data-os-metrics]').children.length===5);slow=true;
  const old=x.app.refresh();slow=false;await x.app.refresh();
  resolveFirst({data:{...snapshot(),pendingEnquiries:999}});await old;
  assert.doesNotMatch(x.root.querySelector('[data-os-metrics]').textContent,/999/);
  const search=x.root.querySelector('[data-os-client-search] input');search.value='changed';search.dispatchEvent(new x.dom.window.Event('input'));
  assert.equal(x.root.querySelector('[data-os-client-list]').children.length,0);
 }finally{x.close();}
});
test('OS DOM: undeployed API is a rejected operation, not an unknown write that blocks navigation',async()=>{
 const x=setup(name=>name==='sculpy_os_create_client'?{error:{code:'PGRST202'}}:undefined);
 try{
  const form=x.root.querySelector('[data-os-client-form]');form.elements.clientName.value='QA';form.elements.confirmed.checked=true;
  submit(x.dom,form);await waitFor(()=>form.textContent.includes('基础接口尚未部署'));
  assert.equal(x.app.canLeave(),true);assert.equal(form.elements.clientName.disabled,false);assert.equal(form.elements.clientName.value,'QA');
 }finally{x.close();}
});
