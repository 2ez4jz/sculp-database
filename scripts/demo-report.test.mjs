import test from 'node:test';
import assert from 'node:assert/strict';
import {demoReport} from '../supabase/functions/sculpy-chat/demo-report.ts';
import {converse} from '../supabase/functions/sculpy-chat/core.ts';
import {bookings} from '../src/data/demo.js';
const args={from:'2026-10-10',to:'2026-10-10',service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:null};
const report=(patch={},rows=bookings)=>demoReport(rows,{...args,...patch},'2026-10-10');
test('daily report, month-to-date cutoff and future completion quality use full 300 records',()=>{
 const day=report();assert.equal(day.records,1);assert.equal(day.completedAmountCents,42500);assert.equal(day.grossReceivedCents,42500);assert.equal(day.catalogQuality.futureCompleted,35);assert.equal(day.catalogQuality.completedOnOrBeforeAsOf,187);
 const mtd=report({from:'2026-10-01'});assert.equal(mtd.records,7);assert.equal(mtd.completed,6);assert.equal(mtd.completedAmountCents,507000);assert.equal(mtd.grossReceivedCents,442500);assert.equal(mtd.futureCompleted,0);
 const all=report({from:'2026-01-01',to:'2026-12-31'});assert.equal(all.records,300);assert.equal(all.completed,222);assert.equal(all.sampleTruncated,true);assert.equal(all.coverage.allMatchingRowsAggregated,true);
});
test('AND combinations and group totals distinguish artist participation from lead responsibility',()=>{
 const ig=report({from:'2026-09-01',to:'2026-09-30',service:'Wedding',channelId:'instagram'});assert.equal(ig.records,3);assert.equal(ig.completed,1);assert.equal(ig.completedAmountCents,173000);assert.equal(ig.grossReceivedCents,173000);
 const google=report({from:'2026-09-01',to:'2026-09-30',service:'Wedding',channelId:'google'});assert.equal(google.records,2);assert.equal(google.completedAmountCents,326000);assert.equal(google.grossReceivedCents,161000);const comparison=google.channelComparisons.find(c=>c.peerChannelId==='instagram');assert.equal(comparison.currentMinusPeer.records,-1);assert.equal(comparison.currentMinusPeer.completed,1);assert.equal(comparison.currentMinusPeer.completedAmountCents,153000);assert.equal(comparison.currentMinusPeer.grossReceivedCents,-12000);assert.equal(comparison.recordCountRelation,'fewer');
 const ranks=report({from:'2026-09-01',to:'2026-09-30',groupBy:'channel'}).rankings;assert.equal(ranks.completedAmountCents.maximum,547500);assert.deepEqual(ranks.completedAmountCents.leaders.map(x=>x.value),['website']);assert.equal(ranks.grossReceivedCents.maximum,374500);assert.deepEqual(ranks.grossReceivedCents.leaders.map(x=>x.value),['website']);
 for(const groupBy of ['channel','artist','service']){const r=report({from:'2026-01-01',to:'2026-12-31',groupBy});assert.equal(r.groups.reduce((n,g)=>n+g.records,0),300);assert.equal(r.groups.reduce((n,g)=>n+g.completedAmountCents,0),r.completedAmountCents);}
 const collaborator=bookings[0].artistIds[1];assert(report({from:'2026-01-01',to:'2026-12-31',artistId:collaborator}).recordsSample.some(b=>b.id==='b0'));
});
test('receipts use actual receipt date independently; unknowns are not converted to priced zero',()=>{
 const modified=structuredClone(bookings);Object.assign(modified.find(b=>b.id==='b157'),{price:null,paidCents:5025,paidDate:'2026-10-09',channelId:null});
 const current=report({bookingId:'b157'},modified);assert.equal(current.completedAmountCents,0);assert.equal(current.unpricedCompleted,1);assert.equal(current.grossReceivedCents,0);assert.equal(current.unknownChannel,1);
 assert.equal(report({from:'2026-10-09',to:'2026-10-09',bookingId:'b157'},modified).grossReceivedCents,5025);
 assert.equal(report({channelId:'unattributed'},modified).records,1);
 assert.throws(()=>report({from:'2026-02-30'}));assert.throws(()=>report({to:'2026-10-09'}));assert.throws(()=>report({sql:'drop'}));assert.throws(()=>report({groupBy:'client'}));
});
test('exact demo reports are unavailable in cloud and limited employee contexts; tool failures cannot become figures',async()=>{
 for(const context of [{mode:'cloud',actor:{role:'owner'},advisorFixture:{}},{mode:'fictional_demo',advisorFixture:null}]){
 let read=0;await converse({context,turns:[],message:'日报',preferences:{},rules:'',query:async()=>({}),demoReport:()=>{read++;return {};},callModel:async body=>{assert(!body.tools.some(t=>t.name==='query_demo_report'));return {output_text:JSON.stringify({answer:'无演示全局报表',references:[],proposals:[]})};}});assert.equal(read,0);
 }
 let calls=0,reads=0;const r=await converse({context:{mode:'fictional_demo',advisorFixture:{},bookings:[]},turns:[],message:'日报',preferences:{},rules:'',query:async()=>({}),demoReport:a=>{reads++;return report(a);},callModel:async body=>{
 if(++calls===1)return {output:[{type:'function_call',name:'query_demo_report',call_id:'d1',arguments:JSON.stringify(args)},{type:'function_call',name:'query_demo_report',call_id:'d2',arguments:JSON.stringify(args)}]};
 assert(body.input.some(i=>i.type==='function_call_output'&&i.output.includes('42500')));return {output_text:JSON.stringify({answer:'CAD425',references:['b157'],proposals:[]})};}});
 assert.equal(reads,1);assert.equal(r.demoReportSources[0].records,1);assert.equal(r.references[0].id,'b157');
});
