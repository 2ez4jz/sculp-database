import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountPersonalSchedule,canManagePersonalSchedule,scheduleOnDay} from '../src/pages/login/personal-schedule.js';
const tick=()=>new Promise(r=>setTimeout(r,10));
function setup({schedule=[],tasks=[],marketing=[],onWorkTask,onWorkWrite,failTasks=false,now=()=>new Date('2026-11-21T15:00:00Z')}={}){
 const dom=new JSDOM('<main id="root"></main>',{url:'https://fixture.test'}),root=dom.window.document.querySelector('#root');dom.window.confirm=()=>true;
 const rows=[...schedule],calls=[];let lose=false;
 const sdk={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='sculpy_os_update_task')return onWorkWrite(args);
  if(name==='sculpy_marketing_set_check'){
   let state=marketing.find(s=>s.post_id===args.p_post_id);
   if(!state){state={post_id:args.p_post_id};marketing.push(state);}
   Object.assign(state,{checked:args.p_checked,updated_at:now().toISOString()});
   return {data:{checked:state.checked}};
  }
  assert.equal(name,'sculpy_shared_daily_work_tasks');
  if(failTasks)return {error:{code:'42501'}};
  return {data:tasks.filter(task=>task.status==='open'?task.due_on<=args.p_day:task.due_on===args.p_day||task.completed_on===args.p_day).slice(args.p_offset,args.p_offset+100)};
 },from(table){let mode='select',data,filters=[];const q={select(){return q;},lte(){return q;},gte(){return q;},order(){return q;},range(){return q;},eq(k,v){filters.push([k,v]);return q;},insert(d){mode='insert';data=d;return q;},update(d){mode='update';data=d;return q;},delete(){mode='delete';return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve().then(()=>{
  if(table==='marketing_checklist_state')return {data:structuredClone(marketing)};
  calls.push({mode,data:structuredClone(data),filters});let found=rows.filter(row=>filters.every(([k,v])=>row[k]===v));
  if(mode==='insert'){if(rows.some(r=>r.id===data.id))return {error:{code:'23505'}};const item={...data,version:1,updated_by:'jz',updated_at:'2026-11-21T15:00:00Z'};rows.push(item);if(lose){lose=false;throw Error('lost response');}return {data:structuredClone(item)};}
  if(mode==='update'){const row=found[0];if(!row)return {data:null};Object.assign(row,data,{version:row.version+1});return {data:structuredClone(row)};}
  if(mode==='delete'){found.forEach(row=>rows.splice(rows.indexOf(row),1));return {data:found.map(x=>({id:x.id}))};}
  return {data:filters.length?structuredClone(found[0]||null):structuredClone(rows)};
 }).then(resolve,reject);}};return q;}};
 const app=mountPersonalSchedule({root,supabase:sdk,profile:{id:'jz',username:'sculp_jz',role:'operations',active:true},onWorkTask,now});
 return {dom,root,rows,calls,app,lose:()=>{lose=true;},close(){app.destroy();dom.window.close();}};
}
const change=(x,el)=>el.dispatchEvent(new x.dom.window.Event('change',{bubbles:true}));
const submit=x=>x.root.querySelector('form').dispatchEvent(new x.dom.window.Event('submit',{bubbles:true,cancelable:true}));
test('personal agenda: date-line/hotel spans and exact-account access',()=>{
 assert.equal(canManagePersonalSchedule({username:'sculp_miranda',role:'owner'}),true);
 assert.equal(canManagePersonalSchedule({username:'other',role:'operations'}),false);
 assert.equal(canManagePersonalSchedule({username:'sculp_jz',role:'artist'}),false);
 assert.equal(canManagePersonalSchedule({username:'sculp_jz',role:'operations',active:false}),false);
 const flight={starts_local:'2026-11-24T01:00:00',ends_local:'2026-11-23T20:00:00'};
 assert.equal(scheduleOnDay(flight,'2026-11-23'),true);assert.equal(scheduleOnDay(flight,'2026-11-25'),false);
 assert.equal(scheduleOnDay({starts_local:'2026-11-21T15:00:00',ends_local:'2026-11-24T11:00:00'},'2026-11-22'),true);
});
test('personal agenda: create, edit, complete, delete; escapes private text and guards draft navigation',async()=>{
 const x=setup();try{await tick();
  x.root.querySelector('[data-ps-new]').click();const f=x.root.querySelector('form').elements;
  f.title.value='<img src=x onerror=alert(1)>';f.notes.value='Bring passport';f.title.dispatchEvent(new x.dom.window.Event('input',{bubbles:true}));assert.equal(x.app.canLeave(),false);
  submit(x);await tick();assert.equal(x.rows.length,1);assert.equal(x.app.canLeave(),true);assert.equal(x.root.querySelector('.ps-item img'),null);assert.match(x.root.querySelector('.ps-item').textContent,/Bring passport/);
  x.root.querySelector('[data-ps-edit]').click();f.title.value='Hotel';f.category.value='hotel';f.end_date.value='2026-11-24';change(x,f.category);submit(x);await tick();assert.equal(x.rows[0].category,'hotel');
  const check=x.root.querySelector('[data-ps-done]');check.checked=true;change(x,check);await tick();assert.equal(x.rows[0].completed,true);
  x.root.querySelector('[data-ps-edit]').click();x.root.querySelector('[data-ps-delete]').click();await tick();assert.equal(x.rows.length,0);
 }finally{x.close();}
});

test('personal agenda opens on today with a single list and changes date only when picked',async()=>{
 const schedule=[{id:'flight',title:'Fictional flight',category:'flight',starts_local:'2026-11-21T20:15:00',ends_local:'2026-11-22T13:00:00',start_timezone:'America/Toronto',end_timezone:'Asia/Shanghai'}];
 const tasks=[{id:'today',reason:'Studio today',status:'open',edit_version:'5',due_on:'2026-11-21'},{id:'tomorrow',reason:'Studio tomorrow',status:'done',due_on:'2026-11-22'},{id:'december',reason:'Studio in December',status:'open',due_on:'2026-12-01'}];
 const opened=[];
 const x=setup({schedule,tasks,onWorkTask:task=>opened.push(task)});
 try{
  const $=selector=>x.root.querySelector(selector);
  await x.app.refresh();
  const toggle=$('[data-ps-toggle]'),picker=$('[data-ps-picker]'),agenda=$('.ps-agenda');
  assert(picker.hidden);
  assert.match(toggle.textContent,/今天/);
  assert.equal(agenda.children.length,2);
  assert.match(agenda.textContent,/Fictional flight/);
  assert.match(agenda.textContent,/Studio today/);
  assert.doesNotMatch(agenda.textContent,/Studio tomorrow/);
  $('[data-ps-work-task="today"]').click();
  assert.equal(opened[0].edit_version,'5');

  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal(picker.querySelectorAll('[data-ps-date]').length,42);
  const selected=$('[data-ps-date="2026-11-21"]');
  assert.equal(x.dom.window.document.activeElement,selected);
  selected.dispatchEvent(new x.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  const nextDay=$('[data-ps-date="2026-11-22"]');
  assert.equal(x.dom.window.document.activeElement,nextDay);
  nextDay.click();
  await tick();
  assert(picker.hidden);
  assert.equal(x.dom.window.document.activeElement,toggle);
  assert.match($('.ps-agenda').textContent,/Fictional flight/);
  assert.match($('.ps-agenda .ps-completed').textContent,/Studio tomorrow/);
  assert.match($('.ps-agenda').textContent,/Studio today/);

  toggle.click();
  $('[data-ps-next]').click();
  assert.match($('.ps-agenda').textContent,/Studio tomorrow/);
  $('[data-ps-date="2026-12-01"]').click();
  await tick();
  assert(picker.hidden);
  assert.match($('.ps-agenda').textContent,/Studio in December/);
  assert(!$('.ps-agenda').textContent.includes('Studio tomorrow'));

  toggle.click();
  picker.dispatchEvent(new x.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert(picker.hidden);
  toggle.click();
  $('[data-ps-today]').click();
  await tick();
  assert.match($('.ps-agenda').textContent,/Studio today/);
 }finally{x.close();}
});

test('personal agenda still shows plans when the work task request fails', async()=>{
 const x=setup({schedule:[{id:'local',title:'Personal task',category:'todo',starts_local:'2026-11-21T00:00:00',all_day:true}],failTasks:true});
 try{
  await x.app.refresh();
  assert.match(x.root.querySelector('.ps-agenda').textContent,/Personal task/);
  assert.match(x.root.querySelector('.ps-read-error').textContent,/工作待办暂未读到/);
 }finally{x.close();}
});

test('the daily list orders timed milestones before date-only items and marks flights and check-in',async()=>{
 const schedule=[
  {id:'stay',title:'Hotel stay',category:'hotel',starts_local:'2026-11-23T00:00:00',ends_local:'2026-11-25T00:00:00',all_day:true},
  {id:'checkout',title:'Hotel checkout',category:'hotel',starts_local:'2026-11-23T15:00:00',ends_local:'2026-11-24T10:00:00'},
  {id:'checkin',title:'Hotel check-in',category:'hotel',starts_local:'2026-11-24T00:00:00',ends_local:'2026-11-26T00:00:00',all_day:true},
  {id:'depart',title:'Flight leaving today',category:'flight',starts_local:'2026-11-23T16:25:00',agenda_start_local:'2026-11-24T08:25:00',start_timezone:'America/Los_Angeles'},
  {id:'arrive',title:'Overnight flight',category:'flight',starts_local:'2026-11-23T22:00:00',ends_local:'2026-11-24T06:30:00',completed:true},
 ];
 const tasks=[{id:'task',reason:'Date-only work task',due_at:'2026-11-24T00:00:00Z',due_on:'2026-11-24',status:'open'}];
 const x=setup({schedule,tasks,now:()=>new Date('2026-11-24T04:00:00Z')});
 try{
  await x.app.refresh();
  assert.deepEqual([...x.root.querySelectorAll('.ps-agenda strong')].map(el=>el.textContent),
   ['Overnight flight','Flight leaving today','Hotel checkout','Hotel stay','Hotel check-in','Date-only work task','Bridal Soft Glam','圣诞限定妆容体验']);
  assert.deepEqual([...x.root.querySelectorAll('.ps-tag-milestone')].map(el=>el.textContent),['航班抵达','航班起飞','酒店入住']);
  assert.equal(x.root.querySelector('[data-ps-item="checkout"] .ps-tag').textContent,'酒店');
  assert.equal(x.root.querySelector('[data-ps-item="stay"] .ps-tag').textContent,'酒店');
 }finally{x.close();}
});

test('shared work and marketing carry forward until completed, with safe replay after an uncertain write',async()=>{
 const task={id:'work',reason:'JZ follow-up',assignee:'JZ',due_on:'2026-11-23',status:'open',edit_version:'1'};
 const writes=[];
 let fail=true;
 const x=setup({tasks:[task],now:()=>new Date('2026-11-24T05:00:00Z'),onWorkWrite:args=>{
  writes.push(structuredClone(args));task.status='done';task.completed_on='2026-11-24';
  if(fail){fail=false;throw Error('lost acknowledgment');}
  return {data:{id:args.p_task_id,requestId:args.p_request_id}};
 }});
 try{
  await x.app.refresh();
  assert.match(x.root.textContent,/原定 2026-11-23/);
  const check=x.root.querySelector('[data-ps-work-done="work"]');check.checked=true;change(x,check);await tick();
  assert.equal(x.app.canLeave(),false);
  x.root.querySelector('[data-ps-work-retry]').click();await tick();
  assert.deepEqual(writes[0],writes[1]);assert.equal(x.app.canLeave(),true);
  assert(x.root.querySelector('[data-ps-work-done="work"]').checked);
  const marketing=x.root.querySelector('[data-ps-marketing-done="1"]');marketing.checked=true;change(x,marketing);await tick();
  assert(x.root.querySelector('[data-ps-marketing-done="1"]').checked);
  x.root.querySelector('[data-ps-day-next]').click();await tick();
  assert.equal(x.root.querySelector('[data-ps-work-done="work"]'),null);
  assert.equal(x.root.querySelector('[data-ps-marketing-done="1"]'),null);
  assert(x.root.querySelector('[data-ps-marketing-done="2"]'));
 }finally{x.close();}
});

test('planner switches to Beijing at local midnight and can focus a shifted flight from its notification',async()=>{
 const id='a1a1a1a1-1111-4111-8111-111111111111';
 const flight={id,title:'Fictional West Coast flight',category:'flight',starts_local:'2026-11-22T16:30:00',agenda_start_local:'2026-11-23T08:30:00',start_timezone:'America/Los_Angeles',location:'Fixture Terminal'};
 let now=new Date('2026-11-22T15:59:59Z');
 const x=setup({schedule:[flight],now:()=>now});
 const $=selector=>x.root.querySelector(selector);
 try{
  await x.app.refresh();
  assert.equal($('[data-ps-clock]').textContent,'多伦多时间');
  assert(!$('.ps-item'));
  now=new Date('2026-11-22T16:00:00Z');
  await x.app.refresh();
  assert.equal($('[data-ps-clock]').textContent,'北京时间');
  assert.match($('[data-ps-toggle]').textContent,/今天.*11月23日/);
  assert.match($('.ps-meta').textContent,/16:30.*08:30 北京时间.*Fixture Terminal/);
  assert.equal(await x.app.openReminder({id,date:'2026-11-23'}),true);
  assert.equal(x.dom.window.document.activeElement,$(`[data-ps-item="${id}"]`));

  $('[data-ps-new]').click();
  const f=$('form').elements;
  assert.equal(f.start_timezone.value,'Asia/Shanghai');
  f.category.value='flight';change(x,f.category);
  f.title.value='Fictional departure';f.start_time.value='07:30';
  f.start_timezone.value='Asia/Tokyo';change(x,f.start_timezone);
  f.start_date.value='2026-11-24';change(x,f.start_date);
  assert.equal(f.start_timezone.value,'Asia/Tokyo');
  f.reminder_start_minutes.value='120';change(x,f.reminder_start_minutes);
  f.reminder_evening.value='always';change(x,f.reminder_evening);
  submit(x);await tick();
  const saved=x.rows.find(row=>row.title==='Fictional departure');
  assert.equal(saved.reminder_start_minutes,120);
  assert.equal(saved.reminder_evening,'always');
 }finally{x.close();}
});
test('personal agenda: lost insert acknowledgment retries same UUID; conflict retains draft',async()=>{
 const x=setup();try{await tick();x.root.querySelector('[data-ps-new]').click();const f=x.root.querySelector('form').elements;f.title.value='Todo';x.lose();submit(x);await tick();
  assert.equal(x.rows.length,1);assert.equal(x.app.canLeave(),false);assert.equal(f.title.disabled,true);await x.app.refresh();assert.equal(f.title.disabled,true);
  submit(x);await tick();assert.equal(x.rows.length,1);assert.equal(x.app.canLeave(),true);
  const inserts=x.calls.filter(c=>c.mode==='insert');assert.equal(inserts[0].data.id,inserts[1].data.id);
  x.root.querySelector('[data-ps-edit]').click();x.rows[0].version++;x.rows[0].title='Miranda changed it';f.title.value='My draft';submit(x);await tick();
  assert.equal(f.title.value,'My draft');assert.match(x.root.querySelector('[data-ps-form-status]').textContent,/另一位刚修改/);assert.equal(x.rows[0].title,'Miranda changed it');
 }finally{x.close();}
});
