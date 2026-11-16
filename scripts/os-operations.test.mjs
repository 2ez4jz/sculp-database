import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountOsOperations} from '../src/pages/login/os-operations.js';

const task={id:'10000000-0000-4000-8000-000000000001',reason:'Call <img src=x onerror=alert(1)>',due_at:'2026-11-17T02:00:00Z',status:'open',edit_version:'3',assignee:'JZ',booking_id:'booking',client:'QA'};
const tick=()=>new Promise(r=>setTimeout(r,2));
async function until(check){for(let i=0;i<100;i++){if(check())return;await tick();}assert.fail('DOM did not settle');}
function setup(override){
  const dom=new JSDOM('<main><section id="tasks"></section><section id="client" hidden></section></main>',{url:'https://qa.test'});
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const taskRoot=dom.window.document.querySelector('#tasks'),clientRoot=dom.window.document.querySelector('#client'),calls=[],orders=[],newTasks=[];
  let saved=0;
  const app=mountOsOperations({taskRoot,clientRoot,onOrder:id=>orders.push(id),onNewTask:x=>newTasks.push(x),onSaved:async()=>{saved++;},supabase:{rpc:async(name,args)=>{
    calls.push({name,args:structuredClone(args)});
    const custom=await override?.(name,args);if(custom!==undefined)return custom;
    if(name==='sculpy_os_tasks')return {data:{total:1,tasks:[{...task,status:args.p_status}]}};
    if(name==='sculpy_os_update_task')return {data:{id:args.p_task_id,requestId:args.p_request_id}};
    if(name==='sculpy_os_client_detail')return {data:{client:{id:args.p_client_id,display_name:'<script>QA</script>',referral_source:'Instagram',city:'Toronto',lifecycle_status:'active'},contact:{email:'qa@example.test',internal_notes:'<img src=x>\nNotes'},total:21,bookings:[{id:'booking',order_number:'612358',service:'Wedding',starts_at:'2026-11-17T02:00:00Z',status:'confirmed'}]}};
  }}});
  const $=s=>taskRoot.querySelector(s),c$=s=>clientRoot.querySelector(s);
  const form=$('[data-task-update]');
  const submit=()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,taskRoot,clientRoot,calls,orders,newTasks,app,$,c$,form,submit,get saved(){return saved;},close(){app.destroy();dom.window.close();}};
}
test('OS operations: task filtering/pagination, Toronto dates and escaped task/customer data',async()=>{
  const x=setup();try{
    await x.app.refreshTasks();assert.equal(x.$('[data-task-list] img'),null);
    assert.match(x.$('[data-task-list]').textContent,/2026-11-16/);
    x.$('[data-task-filter]').value='done';x.$('[data-task-filter]').dispatchEvent(new x.dom.window.Event('change'));
    await until(()=>x.calls.some(c=>c.args.p_status==='done'));
    await x.app.openClient('client');assert.equal(x.clientRoot.querySelector('script,img'),null);
    assert.match(x.clientRoot.textContent,/qa@example.test/);assert.match(x.clientRoot.textContent,/Instagram/);
    x.c$('[data-client-order]').click();assert.deepEqual(x.orders,['booking']);
    x.c$('[data-client-task]').click();assert.equal(x.newTasks[0].clientId,'client');
    x.c$('[data-client-next]').click();await until(()=>x.calls.some(c=>c.args.p_offset===20));
  }finally{x.close();}
});
test('OS operations: complete, cancel and reschedule send confirmed versioned commands',async()=>{
  for(const action of ['complete','cancel','reschedule']){
    const x=setup();try{
      await x.app.refreshTasks();x.$('[data-task-edit]').click();
      x.form.elements.action.value=action;x.form.elements.action.dispatchEvent(new x.dom.window.Event('change'));
      x.form.elements.dueOn.value='2026-12-01';x.form.elements.confirmed.checked=true;x.submit();
      await until(()=>x.saved===1);
      const write=x.calls.find(c=>c.name==='sculpy_os_update_task').args;
      assert.equal(write.p_action,action);assert.equal(write.p_expected_version,'3');assert.equal(write.p_confirmed,true);
      assert.equal(write.p_due_on,action==='reschedule'?'2026-12-01':null);assert.equal(x.app.canLeave(),true);
      assert.equal(x.$('[data-task-editor]').hidden,true);
    }finally{x.close();}
  }
});
test('OS operations: missing confirmation cannot mutate; completed tasks can be reopened',async()=>{
  const x=setup();try{
    await x.app.refreshTasks();x.$('[data-task-edit]').click();x.submit();await tick();
    assert.equal(x.calls.filter(c=>c.name==='sculpy_os_update_task').length,0);
    x.$('[data-task-filter]').value='done';await x.app.refreshTasks();x.$('[data-task-edit]').click();
    assert.equal(x.form.elements.action.value,'reopen');
    x.form.elements.confirmed.checked=true;x.submit();await until(()=>x.saved===1);
    assert.equal(x.calls.find(c=>c.name==='sculpy_os_update_task').args.p_action,'reopen');
  }finally{x.close();}
});
test('OS operations: a lost acknowledgment freezes navigation and retries the same command',async()=>{
  let writes=0;const x=setup(name=>{if(name==='sculpy_os_update_task'&&++writes===1)throw Error('lost');});
  try{
    await x.app.refreshTasks();x.$('[data-task-edit]').click();x.form.elements.confirmed.checked=true;x.submit();
    await until(()=>x.$('[data-task-result]').textContent.includes('重试'));
    assert.equal(x.app.canLeave(),false);assert.equal(x.form.elements.action.disabled,true);
    const reads=x.calls.length;await x.app.openClient('other');await x.app.refreshTasks();assert.equal(x.calls.length,reads);
    x.submit();await until(()=>x.saved===1);
    const calls=x.calls.filter(c=>c.name==='sculpy_os_update_task');assert.deepEqual(calls[0].args,calls[1].args);
  }finally{x.close();}
});
test('OS operations: concurrent conflict requires rereading rather than overwriting',async()=>{
  const x=setup(name=>name==='sculpy_os_update_task'?{error:{code:'40001'}}:undefined);
  try{
    await x.app.refreshTasks();x.$('[data-task-edit]').click();x.form.elements.confirmed.checked=true;x.submit();
    await until(()=>x.$('[data-task-result]').textContent.includes('其他人更新'));
    assert.equal(x.app.canLeave(),true);x.submit();await tick();
    assert.equal(x.calls.filter(c=>c.name==='sculpy_os_update_task').length,1);assert.equal(x.saved,0);
  }finally{x.close();}
});
test('OS operations: successful write remains acknowledged when subsequent list refresh fails',async()=>{
  let updated=false;const x=setup(name=>{
    if(name==='sculpy_os_update_task')updated=true;
    if(name==='sculpy_os_tasks'&&updated)return {error:{code:'offline'}};
  });
  try{
    await x.app.refreshTasks();x.$('[data-task-edit]').click();x.form.elements.confirmed.checked=true;x.submit();
    await until(()=>x.saved===1);assert.equal(x.app.canLeave(),true);
    assert.match(x.$('[data-task-status]').textContent,/已保存.*暂不可用/);
    assert.equal(x.calls.filter(c=>c.name==='sculpy_os_update_task').length,1);
  }finally{x.close();}
});
test('OS operations: stale customer responses and denied reads never reveal the previous customer',async()=>{
  let resolve;const x=setup((name,args)=>{
    if(name==='sculpy_os_client_detail'&&args.p_client_id==='slow')return new Promise(r=>resolve=r);
    if(name==='sculpy_os_client_detail'&&args.p_client_id==='denied')return {error:{code:'42501'}};
  });
  try{
    const slow=x.app.openClient('slow');await tick();await x.app.openClient('current');
    resolve({data:{client:{id:'slow',display_name:'Stale customer'},bookings:[]}});await slow;
    assert.doesNotMatch(x.clientRoot.textContent,/Stale customer/);
    await x.app.openClient('denied');assert.match(x.clientRoot.textContent,/暂不可用/);assert.doesNotMatch(x.clientRoot.textContent,/qa@example.test/);
  }finally{x.close();}
});
