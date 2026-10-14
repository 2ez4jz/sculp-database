import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bookings} from '../src/data/demo.js';
import {buildAnalysisCharts} from '../src/components/analysis/charts.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const dashboard=readFileSync(new URL('../src/components/analysis/sculpy-dashboard.js',import.meta.url),'utf8');
test('Sculpy keeps fixed dashboard above inline conversation charts',()=>{
 assert.ok(app.includes('id="sculpy-dashboard"')&&app.includes('id="sculpy-chat-root"'));
 assert.match(app,/renderSupplement:turn=>turn\.analysisCharts\?\.length&&isGlobal\(\)\?/);
 assert.match(app,/renderAnalysisCharts\(turn\.analysisCharts,esc/);
 assert.doesNotMatch(app,/sculpyDashboard\.render\(turns\)/);
 assert.doesNotMatch(dashboard,/newest|latest|dismissedTurn|turn\.chartKey/);
});
test('three default diagrams use the same full fictional catalog',()=>{
 for(const message of ['300单服务订单占比','300单各渠道收款金额饼图','300单化妆师订单占比']){
  const charts=buildAnalysisCharts({message,bookings,day:'2026-10-13'});
  assert.ok(charts.length>0,message);
  assert.equal(charts[0].fictional,true);
  assert.equal(charts[0].from,'2026-01-01');
  assert.equal(charts[0].to,'2026-12-31');
 }
});
