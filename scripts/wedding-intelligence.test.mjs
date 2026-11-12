import test from 'node:test';import assert from 'node:assert/strict';
import {makeEnquiryHandler} from '../supabase/functions/sculp-enquiry/handler.js';
import {converse} from '../supabase/functions/sculpy-chat/core.ts';
import {validateWeddingQuery} from '../supabase/functions/sculpy-chat/wedding-tools.js';
import {money,renderWeddingReport} from '../src/pages/login/wedding-dashboard.js';
const args={from:'2026-10-01',to:'2026-10-18',observation:'2026-10-18',serviceYear:2027,source:null,service:'wedding'};
test('website body bounds, dates, origin, hidden field, safe response and persistence delegation',async()=>{
 let calls=0;const handler=makeEnquiryHandler(async(row,bucket)=>{calls++;assert.equal(row.service,'Bridal');assert.equal(row.email,'qa@example.test');assert.equal(bucket.length,64);assert(!('status' in row));return {ok:true};});
 const valid={submission_id:crypto.randomUUID(),name:'QA',email:'QA@example.test',service:'Bridal',date:'2027-07-01',location:'Toronto'};
 const req=(body,origin='https://sculpstudio.ca')=>new Request('https://example.test',{method:'POST',headers:{origin},body:typeof body==='string'?body:JSON.stringify(body)});
 assert.equal((await handler(req(valid))).status,200);assert.equal(calls,1);
 assert.equal((await handler(req({...valid,date:'2027-02-30'}))).status,400);
 assert.equal((await handler(req(valid,'https://evil.test'))).status,403);
 assert.equal((await handler(req('x'.repeat(18001)))).status,413);
 assert.equal((await handler(req({...valid,_honey:'robot'}))).status,200);assert.equal(calls,1);
 const limited=makeEnquiryHandler(async()=>{throw Object.assign(Error('private'),{code:'P0429'});});assert.equal((await limited(req(valid))).status,429);
});
test('trusted wedding reporting follows checked SQL tool and persists source trace; artist/demo have no tool',async()=>{
 let n=0,sqlCalls=0;
 const r=await converse({context:{actor:{role:'owner'},bookings:[]},turns:[],message:'本月真正到账多少钱？',preferences:{},rules:'',query:async()=>({}),weddingReport:async(a)=>{sqlCalls++;assert.equal(a.p_from,args.from);return {source:'canonical_wedding_intelligence_v23',period:{from:a.p_from,to:a.p_to},asOf:'2026-10-18',cash:{netCents:'170000'},coverage:{}};},callModel:async body=>{n++;assert(body.instructions.includes('不能把缺失当零'));assert(body.tools.some(t=>t.name==='query_wedding_intelligence')||n===4);if(n===1)return {output:[{type:'function_call',name:'query_wedding_intelligence',call_id:'w1',arguments:JSON.stringify(args)}]};assert(body.input.some(x=>x.type==='function_call_output'&&x.output.includes('170000')));return {output_text:'本月净到账 CA$1,700.00，按实际支付日期扣退款。'};}});
 assert.equal(sqlCalls,1);assert.equal(r.weddingReportSources[0].source,'canonical_wedding_intelligence_v23');assert(r.answer.includes('1,700.00'));
 for(const context of [{actor:{role:'artist'},bookings:[]},{actor:{role:'owner'},mode:'fictional_demo',bookings:[]}])await converse({context,turns:[],message:'你好',preferences:{},rules:'',query:async()=>({}),weddingReport:async()=>{throw Error('not called');},callModel:async body=>{assert(!body.tools.some(t=>t.name==='query_wedding_intelligence'));return {output_text:'你好。'};}});
});
test('query validation excludes invalid dates, ranges, hidden fields; exact cents display',()=>{
 assert.equal(validateWeddingQuery(args).p_service_year,2027);
 for(const bad of [{...args,from:'2026-02-30'},{...args,serviceYear:2027.1},{...args,source:{}},{...args,extra:true},{...args,from:'2020-01-01'}])assert.throws(()=>validateWeddingQuery(bad));
 assert.equal(money('100000000000001'),'CA$1,000,000,000,000.01');assert.equal(money('-101'),'-CA$1.01');assert.equal(money(null),'未确定');
});
