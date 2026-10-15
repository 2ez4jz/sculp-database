import {catalogHistoryFrom} from "../supabase/functions/sculpy-chat/period-policy.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {boundedDemoRequest} from '../src/domain/chat-history.js';
import {buildAnalysisCharts,chartCommentary,renderAnalysisCharts} from '../src/components/analysis/charts.js';
import {bookings} from '../src/data/demo.js';
import {advisorRowsFromBookings,advisorSnapshot} from '../src/domain/demo-workspace.js';
import {advisorMetrics} from '../src/domain/advisor-engine.js';
import {demoReport,compactDemoReport} from '../supabase/functions/sculpy-chat/demo-report.js';
import {structuredIntent} from '../supabase/functions/sculpy-chat/skills.js';
import {isAnalystQuestion} from '../supabase/functions/sculpy-chat/agent-routing.js';
import {serviceRevenue} from '../src/domain/analytics.js';
import {converse} from '../supabase/functions/sculpy-chat/core.ts';
const filters={from:'2026-09-01',to:'2026-09-30',service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:null};
const chart=q=>buildAnalysisCharts({message:q,bookings,day:'2026-10-14'});
test('fallback chart dates honor last year, quarters and explicit cutoffs',()=>{
 for(const [q,from,to] of [['去年服务占比饼图','2025-01-01','2025-12-31'],['Q3服务占比图表','2026-07-01','2026-09-30'],['本月截至10月10日服务占比饼图','2026-10-01','2026-10-10'],['截至2026-10-10服务占比饼图','2026-10-01','2026-10-10']]){
  const c=chart(q)[0];assert.equal(c.from,from,q);assert.equal(c.to,to,q);
 }
 assert.deepEqual(chart('最近24个月服务占比饼图'),[]);
 assert.equal(chart('9月Michelle服务占比饼图')[0].filters.artistId,'michelle');
});
test('period and trend charts retain missing-price caveats and real changes',()=>{
 const rows=structuredClone(bookings);
 const b=rows.find(b=>b.status==='Completed'&&b.date.startsWith('2026-09'));b.price=null;
 const reports=[demoReport(rows,{...filters,from:'2026-08-01',to:'2026-08-31'},'2026-10-14'),demoReport(rows,filters,'2026-10-14')];
 const c=buildAnalysisCharts({message:'8月和9月收入对比',bookings:rows,reports,day:'2026-10-14'})[0];
 assert.equal(c.kind,'trend');assert.ok(c.unpriced);
 assert.match(renderAnalysisCharts([c],String),/金额不完整/);
 assert.match(chartCommentary(c),/首尾周期/);
 assert.match(chartCommentary(c),/增加|减少|未变化/);
 const pie=buildAnalysisCharts({message:'9月收入占比饼图',bookings:rows,day:'2026-10-14'})[0];
 assert.equal(pie.current.unpricedCompleted,1);
 assert.match(chartCommentary(pie),/金额变化不完整/);
});
test('AI summary does not invent CAD prices or receipt months for invalid data',()=>{
 const base={...bookings[0],status:'Completed',price:100,paidCents:10000,date:'2026-09-02',paidDate:'2026-09-03'};
 const rows=advisorRowsFromBookings([{...base,currency:'USD'},{...base,paidDate:null},{...base,paidDate:'2026-02-30'},{...base,price:1.234}]);
 assert.equal(rows[0].amountCents,null);assert.equal(rows[0].paidCents,0);
 assert.equal(rows[1].paidMonth,null);assert.equal(rows[1].paidCents,0);
 assert.equal(rows[2].paidMonth,null);assert.equal(rows[3].amountCents,null);
 assert.equal(advisorMetrics(rows,{month:'2026-09'}).receivedCents,10000);
 const summary=advisorSnapshot(rows).summary;
 assert.equal(summary.unpricedCompleted,2);assert.equal(summary.undatedReceipts,2);assert.equal(summary.invalidReceipts,1);
});
test('visual analysis preserves the requested explanation instead of replacing it with a fixed summary',async()=>{
 let calls=0;
 const result=await converse({context:{mode:'fictional_demo',advisorFixture:{},bookings:[]},turns:[],message:'9月渠道收入饼图并分析原因',preferences:{},rules:'',query:async()=>({}),demoReport:a=>demoReport(bookings,a,'2026-10-14'),callModel:async()=>++calls===1?{output:[{type:'function_call',name:'query_demo_report',call_id:'review',arguments:JSON.stringify({...filters,groupBy:'channel'})}]}:{output_text:JSON.stringify({answer:'订单结构值得核对；建议检查咨询来源，不能仅凭金额推断广告效率。',references:[],proposals:[]})}});
 assert.match(result.answer,/建议检查咨询来源/);assert.equal(result.demoReportSources.length,1);
});
test('SDK routing keeps order queries, notes and record changes on the original flow',()=>{
 assert.equal(isAnalystQuestion('Sarah在哪里服务？'),false);
 assert.equal(isAnalystQuestion('记一下9月收入要核对'),false);
 assert.equal(isAnalystQuestion('比较8月9月收入'),true);
 assert.equal(isAnalystQuestion('继续',{length:1}),false);
 assert.equal(isAnalystQuestion('用图看看',[{demoReportSources:[{}]}]),true);
});
test('actual handler gates SDK by scope/fixture and safely falls back on runtime failure',async()=>{
 const raw=readFileSync(new URL('../supabase/functions/sculpy-chat/handler.ts',import.meta.url),'utf8');
 const source=stripTypeScriptTypes(raw).replace(/^import .*;\n/gm,'').replace('export async function','async function').replace('import("./agent.ts")','Promise.resolve({runSculpyDemoAgent:sdk})');
 let sdkCalls=0,legacyCalls=0,fail=false;
 const ctx={catalogHistoryFrom,Request,Response,Intl,Date,Set,Map,JSON,String,Number,Error,TextEncoder,console:{error:()=>{}},demoReport,isAnalystQuestion,structuredIntent,Deno:{env:{get:()=>''}},converse:async()=>{legacyCalls++;return {answer:'legacy reply',references:[],proposals:[],sourceIds:[]};},sdk:async()=>{sdkCalls++;if(fail)throw Error('SDK unavailable');return {answer:'SDK reply',references:[],proposals:[],sourceIds:[]};}};
 vm.runInNewContext(source+';globalThis.entry=handleRequest;',ctx);
 const send=async patch=>{
  const response=await ctx.entry(new Request('https://example.test',{method:'POST',headers:{origin:'http://localhost:4173'},body:JSON.stringify({mode:'demo',agentMode:'sdk',message:'比较8月9月收入',requestId:crypto.randomUUID(),catalog:{bookings:[]},advisorFixture:{version:'sculp-unified-300-v2',fictional:true},...patch})}));
  return {status:response.status,...await response.json()};
 };
 assert.equal((await send({})).turn.engine,'sdk');
 assert.equal((await send({bookingId:'b0'})).turn.engine,'legacy');
 assert.equal((await send({advisorFixture:null})).turn.engine,'legacy');
 assert.equal((await send({message:'记一下9月收入要核对'})).turn.engine,'legacy');
 fail=true;const fallback=await send({});assert.equal(fallback.turn.engine,'legacy');assert.equal(fallback.turn.agentFallback,true);
 assert.equal((await send({mode:'cloud'})).status,401);
 assert.equal(sdkCalls,2);assert.equal(legacyCalls,4);
});

test('saved report summaries exclude full samples/groups and keep follow-up payload bounded',()=>{
 const reports=[compactDemoReport(demoReport(bookings,{...filters,groupBy:'artist'},'2026-10-14'))];
 assert.equal(reports[0].recordsSample,undefined);assert.equal(reports[0].groups,undefined);
 const history=Array.from({length:12},()=>({user:'比较最近两月收入',answer:'已完成金额和到账原额不同。',demoReportSources:reports}));
 assert(Buffer.byteLength(JSON.stringify({catalog:{bookings},turns:history}))<180000);
});

test('large or old SDK histories trim oldest wire turns while keeping the visible history intact',()=>{
 const turns=Array.from({length:12},(_,i)=>({id:String(i),user:'客户需求'.repeat(200),answer:'分析结果'.repeat(3000),analysisCharts:[{rows:bookings}],demoReportSources:[demoReport(bookings,filters,'2026-10-14')]}));
 const result=boundedDemoRequest({mode:'demo',catalog:{bookings},turns});
 assert.equal(turns.length,12);assert(result.turns.length<12);assert.equal(result.turns.at(-1).id,'11');
 assert.equal(result.turns.at(-1).analysisCharts,undefined);assert.equal(result.turns.at(-1).demoReportSources[0].recordsSample,undefined);
 assert(Buffer.byteLength(JSON.stringify(result))<=176000);
 assert.throws(()=>boundedDemoRequest({catalog:{bookings:[{text:'过大'.repeat(90000)}]}}),/缩小数据集/);
});

test('legacy service chart uses the actual trailing 30 days and excludes invalid prices',()=>{
 const rows=[{id:'ok',date:'2026-10-14',status:'Completed',service:'Wedding',price:12.34},{id:'future',date:'2026-12-01',status:'Completed',service:'Wedding',price:999},{id:'missing',date:'2026-10-14',status:'Completed',service:'Wedding',price:null},{id:'usd',date:'2026-10-14',status:'Completed',service:'Wedding',price:10,currency:'USD'}];
 const r=serviceRevenue(rows,{}, {environment:'demo',today:'2026-10-14'});
 assert.equal(r.total,12.34);assert.equal(r.unpriced,2);assert.equal(r.end.toISOString().slice(0,10),'2026-10-14');
});
