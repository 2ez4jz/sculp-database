import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountPersonalSchedule,canManagePersonalSchedule,scheduleOnDay} from '../src/pages/login/personal-schedule.js';
const tick=()=>new Promise(r=>setTimeout(r,10));
function setup(){
 const dom=new JSDOM('<main id="root"></main>',{url:'https://fixture.test'}),root=dom.window.document.querySelector('#root');dom.window.confirm=()=>true;
 const rows=[],calls=[];let lose=false;
 const sdk={from(){let mode='select',data,filters=[];const q={select(){return q;},lte(){return q;},gte(){return q;},order(){return q;},range(){return q;},eq(k,v){filters.push([k,v]);return q;},insert(d){mode='insert';data=d;return q;},update(d){mode='update';data=d;return q;},delete(){mode='delete';return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve().then(()=>{
  calls.push({mode,data:structuredClone(data),filters});let found=rows.filter(row=>filters.every(([k,v])=>row[k]===v));
  if(mode==='insert'){if(rows.some(r=>r.id===data.id))return {error:{code:'23505'}};const item={...data,version:1,updated_by:'jz',updated_at:'2026-11-21T15:00:00Z'};rows.push(item);if(lose){lose=false;throw Error('lost response');}return {data:structuredClone(item)};}
  if(mode==='update'){const row=found[0];if(!row)return {data:null};Object.assign(row,data,{version:row.version+1});return {data:structuredClone(row)};}
  if(mode==='delete'){found.forEach(row=>rows.splice(rows.indexOf(row),1));return {data:found.map(x=>({id:x.id}))};}
  return {data:filters.length?structuredClone(found[0]||null):structuredClone(rows)};
 }).then(resolve,reject);}};return q;}};
 const app=mountPersonalSchedule({root,supabase:sdk,profile:{id:'jz',username:'sculp_jz',role:'operations',active:true},now:()=>new Date('2026-11-21T15:00:00Z')});
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
 const x=setup();try{await tick();assert.equal(x.root.querySelectorAll('[data-ps-date]').length,42);
  x.root.querySelector('[data-ps-new]').click();const f=x.root.querySelector('form').elements;
  f.title.value='<img src=x onerror=alert(1)>';f.notes.value='Bring passport';f.title.dispatchEvent(new x.dom.window.Event('input',{bubbles:true}));assert.equal(x.app.canLeave(),false);
  submit(x);await tick();assert.equal(x.rows.length,1);assert.equal(x.app.canLeave(),true);assert.equal(x.root.querySelector('.ps-item img'),null);assert.match(x.root.querySelector('.ps-item').textContent,/Bring passport/);
  x.root.querySelector('[data-ps-edit]').click();f.title.value='Hotel';f.category.value='hotel';f.end_date.value='2026-11-24';change(x,f.category);submit(x);await tick();assert.equal(x.rows[0].category,'hotel');
  const check=x.root.querySelector('[data-ps-done]');check.checked=true;change(x,check);await tick();assert.equal(x.rows[0].completed,true);
  x.root.querySelector('[data-ps-edit]').click();x.root.querySelector('[data-ps-delete]').click();await tick();assert.equal(x.rows.length,0);
 }finally{x.close();}
});
test('personal agenda: lost insert acknowledgment retries same UUID; conflict retains draft',async()=>{
 const x=setup();try{await tick();x.root.querySelector('[data-ps-new]').click();const f=x.root.querySelector('form').elements;f.title.value='Todo';x.lose();submit(x);await tick();
  assert.equal(x.rows.length,1);assert.equal(x.app.canLeave(),false);assert.equal(f.title.disabled,true);
  submit(x);await tick();assert.equal(x.rows.length,1);assert.equal(x.app.canLeave(),true);
  const inserts=x.calls.filter(c=>c.mode==='insert');assert.equal(inserts[0].data.id,inserts[1].data.id);
  x.root.querySelector('[data-ps-edit]').click();x.rows[0].version++;x.rows[0].title='Miranda changed it';f.title.value='My draft';submit(x);await tick();
  assert.equal(f.title.value,'My draft');assert.match(x.root.querySelector('[data-ps-form-status]').textContent,/另一位刚修改/);assert.equal(x.rows[0].title,'Miranda changed it');
 }finally{x.close();}
});
