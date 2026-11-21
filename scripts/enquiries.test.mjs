import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountWebsiteEnquiries} from '../src/pages/login/enquiries.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
function setup({uncertain=false}={}){
 const dom=new JSDOM('<main></main>',{url:'https://fixture.test'});
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const original=globalThis.FormData;globalThis.FormData=dom.window.FormData;
 const root=dom.window.document.querySelector('main');
 const lead={id:'59000000-0000-4000-8000-000000000001',revision:1,name:'Fixture customer',email:'customer@example.test',service:'Bridal',status:'pending',entry_channel:'website',first_contact_at:'2026-11-20T15:00:00Z',notes:'Existing note',details:'Original requirements',attribution_source:'instagram'};
 const requests=[],converted=[];
 const supabase={from(table){const filters=[];const q={select:()=>q,eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},order:()=>q,limit:()=>q,then(resolve){const rows=table==='profiles'?[]:[lead].filter(l=>filters.every(([k,v])=>k==='is_test'||(Array.isArray(v)?v.includes(l[k]):l[k]===v)));return Promise.resolve({data:structuredClone(rows)}).then(resolve);}};return q;},rpc:async(name,args)=>{
  assert.equal(name,'sculpy_wedding_command');requests.push(structuredClone(args));
  Object.assign(lead,{notes:args.p_payload.reason,status:args.p_payload.status,lost_reason:args.p_payload.lostReason,revision:2});
  if(uncertain){uncertain=false;throw Error('Lost acknowledgment');}
  return {data:{leadId:lead.id,revision:2}};
 }};
 const app=mountWebsiteEnquiries({root,supabase,onConvert:l=>converted.push(l)});
 return {root,lead,requests,converted,app,dom,close(){app.destroy();dom.window.close();globalThis.FormData=original;}};
}

test('simple enquiry actions preserve customer details and require an explicit failure reason',async()=>{
 const x=setup();try{
  await tick();
  assert(x.root.querySelector('.comm-lead-profile'),x.root.textContent);
  assert.equal(x.root.querySelector('.enquiry-communication').open,false);
  x.root.querySelector('[data-lead-conversion] > button').click();assert.equal(x.converted[0].id,x.lead.id);
  x.root.querySelector('[data-quick-notes]').value='Followed up by email';
  x.root.querySelector('[data-save-notes]').click();await tick();
  assert.equal(x.requests[0].p_payload.reason,'Followed up by email');
  assert.equal(x.requests[0].p_payload.email,'customer@example.test');
  assert.equal(x.requests[0].p_payload.status,'pending');
  x.root.querySelector('[data-fail-lead]').click();x.root.querySelector('[data-confirm-failure]').click();
  assert.equal(x.requests.length,1);
  const reason=x.root.querySelector('[data-failure-reason]');reason.value='其他原因';reason.dispatchEvent(new x.dom.window.Event('change'));
  x.root.querySelector('[data-confirm-failure]').click();assert.equal(x.requests.length,1);
  x.root.querySelector('[data-failure-note]').value='Schedule unavailable';
  x.root.querySelector('[data-confirm-failure]').click();await tick();
  assert.equal(x.requests[1].p_payload.status,'lost');assert.equal(x.requests[1].p_payload.lostReason,'Schedule unavailable');
  assert.equal(x.lead.notes,'Followed up by email');
 }finally{x.close();}
});

test('quick enquiry note retry preserves the original request after a lost receipt',async()=>{
 const x=setup({uncertain:true});try{
  await tick();x.root.querySelector('[data-save-notes]').click();await tick();
  assert.equal(x.app.canLeave(),false);
  assert.equal(x.root.querySelector('[data-quick-notes]').disabled,true);
  x.root.querySelector('[data-save-notes]').click();await tick();
  assert.deepEqual(x.requests[0],x.requests[1]);assert.equal(x.app.canLeave(),true);
 }finally{x.close();}
});
