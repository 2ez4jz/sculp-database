import test from 'node:test';
import assert from 'node:assert/strict';
import {instructions} from '../supabase/functions/sculpy-chat/core.ts';
import {bookings} from '../src/data/demo.js';
import {demoReport, demoVisualSummary} from '../supabase/functions/sculpy-chat/demo-report.js';
const base={from:'2026-01-01',to:'2026-12-31',service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:null};
const report=(patch={},rows=bookings)=>demoReport(rows,{...base,...patch},'2026-10-13');
test('V2.1: model guidance defaults to evidence and everyday explanation, with a low-risk suggested check',()=>{
 for(const phrase of ['数据解释原则','应主动补充一条简短、低风险、可执行的核查或改善建议','区分已证实事实与可能原因','简单问题直接答'])assert.ok(instructions.includes(phrase),phrase);
});
test('V2.1: one-dimensional service and channel breakdowns reconcile on exact denominator',()=>{
 const total=report();
 for(const groupBy of ['service','channel']){
  const grouped=report({groupBy});
  for(const metric of ['records','completed','completedAmountCents','grossReceivedCents']){
   assert.equal(grouped.groups.reduce((sum,g)=>sum+g[metric],0),total[metric],groupBy+' '+metric);
  }
 }
});
test('V2.1: explanations disclose scope, CAD, service value and receipt caveats',()=>{
 const r=report({from:'2026-09-01',to:'2026-09-30',groupBy:'channel'});
 assert.match(demoVisualSummary(r,'9月收入饼图'),/虚构测试数据/);
 assert.match(demoVisualSummary(r,'9月收入饼图'),/不是利润/);
 assert.match(demoVisualSummary(r,'9月收款饼图'),/未扣退款/);
});
test('V2.1: negative amount and unpriced revenue are not fabricated into service value',()=>{
 const altered=structuredClone(bookings);
 const target=altered.find(b=>b.status==='Completed');
 assert.ok(target);
 Object.assign(target,{price:null});
 const scoped=report({from:target.date,to:target.date,bookingId:target.id},altered);
 assert.equal(scoped.unpricedCompleted,1);
 assert.equal(scoped.completedAmountCents,0);
 assert.match(demoVisualSummary(scoped,'订单收入'),/合计不完整/);
});
