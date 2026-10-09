import test from "node:test";
import assert from "node:assert/strict";
import {analyzeMonthlyQuestion,renderMonthlyChatChart} from "../src/domain/monthly-chat.js";
import {bookings} from "../src/data/demo.js";
const admin={role:"admin"};
test("three-month question produces verified deterministic values and a chart",()=>{
 const r=analyzeMonthlyQuestion("过去三个月的收入和订单变化，分析一下",bookings,admin);
 assert.equal(r.chartKey,"monthly-analytics");
 assert.equal(r.chartRows.length,3);
 assert.equal(r.chartRows.at(-1).month,"2026-10");
 assert.match(r.answer,/13,230/);
 assert.match(r.answer,/AI 探索性分析/);
 assert.match(renderMonthlyChatChart(r.chartRows,x=>x),/sculpy-monthly-chart/);
});
test("employee cannot see amounts",()=>{
 const r=analyzeMonthlyQuestion("月度收入",bookings,{role:"artist",artistId:"emily"});
 assert.match(r.answer,/仅对管理人员开放/);
 assert.equal(r.chartRows,undefined);
});
test("unrelated chat stays with AI",()=>assert.equal(analyzeMonthlyQuestion("Sarah试妆有什么偏好？",bookings,admin),null));
test("unknown months return zeros rather than invented income",()=>{
 const r=analyzeMonthlyQuestion("2026-12 月的收入",bookings,admin);
 assert.equal(r.chartRows[0].amountCents,0);
 assert.equal(r.chartRows[0].bookings,0);
});

test("this month and last month use the latest fictional booking month",()=>{
 const current=analyzeMonthlyQuestion("本月收入",bookings,admin);
 const previous=analyzeMonthlyQuestion("上个月收入",bookings,admin);
 assert.deepEqual(current.chartRows.map(r=>r.month),["2026-10"]);
 assert.deepEqual(previous.chartRows.map(r=>r.month),["2026-09"]);
});
