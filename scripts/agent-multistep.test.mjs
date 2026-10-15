import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {conversationInstructions,selectSkills} from '../supabase/functions/sculpy-chat/skills.js';
import {compactDemoReport,compareDemoReports} from '../supabase/functions/sculpy-chat/demo-report.js';

// Exercises the ACTUAL agent adapter with injected SDK stand-ins.
// It deliberately does not call a paid model or production database.
const source=readFileSync(new URL('../supabase/functions/sculpy-chat/agent.ts',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'')
 .replace('export async function runSculpyDemoAgent','async function runSculpyDemoAgent');

function harness(script){
 const traces=[];
 const sdk={
  Agent:class{constructor(options){this.options=options;}},
  tool:options=>options,
  MemorySession:class{constructor(options){this.items=options.initialItems;}},
  OpenAIProvider:class{constructor(options){assert.equal(options.apiKey,'fake-key');}},
  Runner:class{constructor(options){assert.equal(options.tracingDisabled,true);} async run(agent,prompt,options){
   assert.equal(options.maxTurns,7);
   for(const item of options.session.items)if(item.role==='assistant'){assert.equal(item.status,'completed');assert(Array.isArray(item.content));}
   const execute=agent.options.tools.find(t=>t.name==='query_demo_report').execute;
   const output=await script(execute,traces);
   return {finalOutput:output};
  }}
 };
 const ctx={conversationInstructions,selectSkills,...sdk,z:{object:()=>({}),number:()=>({int:()=>({min:()=>({})})}),string:()=>({regex:()=>({}),nullable:()=>({})}),enum:()=>({nullable:()=>({})})},instructions:'Test-only instructions',demoReportingInstructions:'Test-only report rules',JSON,Error,String,Array,AbortSignal,compactDemoReport,compareDemoReports};
 vm.runInNewContext(source+';globalThis.agentEntry=runSculpyDemoAgent;',ctx);
 return {entry:ctx.agentEntry,traces};
}
const base={from:'2026-08-01',to:'2026-08-31',service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:null};
const validContext={mode:'fictional_demo',advisorFixture:{fictional:true},localDate:'2026-10-14',timezone:'America/Toronto'};
test('two-step month comparison invokes separate exact reports and keeps chart sources',async()=>{
 const h=harness(async execute=>{
  const a=JSON.parse(await execute(base));
  const b=JSON.parse(await execute({...base,from:'2026-09-01',to:'2026-09-30'}));
  assert.equal(a.completedAmountCents,100000);
  assert.equal(b.completedAmountCents,120000);
  return '9月比8月增加 CAD 200，建议核对渠道构成';
 });
 const calls=[];
 const result=await h.entry({message:'比较8月和9月收入',turns:[{user:'上一个问题',answer:'上一个回复'}],context:validContext,apiKey:'fake-key',demoReport:async filters=>{
  calls.push(filters);
  return {filters,completedAmountCents:filters.from==='2026-08-01'?100000:120000};
 }});
 assert.equal(calls.length,2);
 assert.equal(result.demoReportSources.length,2);
 assert.match(result.answer,/建议/);assert.match(result.answer,/虚构测试数据/);assert.match(result.answer,/不能直接认定为欠款/);
});
test('multi-step channel comparison preserves different scopes',async()=>{
 const h=harness(async execute=>{
  const google=JSON.parse(await execute({...base,channelId:'google'}));
  const instagram=JSON.parse(await execute({...base,channelId:'instagram'}));
  assert.equal(google.filters.channelId,'google');
  assert.equal(instagram.filters.channelId,'instagram');
  return '两个渠道的服务金额口径不同于利润，建议核对确认率';
 });
 const result=await h.entry({message:'比较两个渠道',context:validContext,apiKey:'fake-key',demoReport:async filters=>({filters})});
 assert.equal(result.demoReportSources.length,2);
});
test('rejects invalid date order and disallows non-demo contexts',async()=>{
 const h=harness(async execute=>{
  await assert.rejects(()=>execute({...base,from:'2026-10-01',to:'2026-09-01'}),/Invalid date order/);
  await execute(base);return '日期错误，无法分析';
 });
 const valid=await h.entry({message:'日期测试',context:validContext,apiKey:'fake-key',demoReport:async filters=>({filters})});
 assert.equal(valid.demoReportSources.length,1);
 await assert.rejects(()=>h.entry({message:'真实订单',context:{mode:'production',advisorFixture:{}},apiKey:'fake-key',demoReport:async()=>({})}),/fictional demo/);
 await assert.rejects(()=>h.entry({message:'缺少密钥',context:validContext,apiKey:'',demoReport:async()=>({})}),/API key/);
});

test('Agent enforces six report calls and rejects analysis without verified sources',async()=>{
 const h=harness(async execute=>{
  for(let i=0;i<6;i++)await execute(base);
  await assert.rejects(()=>execute(base),/Too many report calls/);
  return '已核对六个查询';
 });
 let count=0;await h.entry({message:'多步骤分析',context:validContext,apiKey:'fake-key',demoReport:async()=>{count++;return {};}});assert.equal(count,6);
 const missing=harness(async()=> '9月完成金额CAD 1000000');
 await assert.rejects(()=>missing.entry({message:'收入',context:validContext,apiKey:'fake-key',demoReport:async()=>({})}),/without verified reports/);
});
