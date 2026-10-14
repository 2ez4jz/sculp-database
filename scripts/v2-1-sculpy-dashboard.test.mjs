import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bookings} from '../src/data/demo.js';
import {buildAnalysisCharts} from '../src/components/analysis/charts.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const chat=readFileSync(new URL('../src/components/chat/panel.js',import.meta.url),'utf8');
const dashboard=readFileSync(new URL('../src/components/analysis/sculpy-dashboard.js',import.meta.url),'utf8');
test('Sculpy embeds one dashboard above chat and updates from turns',()=>{
 assert.ok(app.includes('id="sculpy-dashboard"') && app.includes('id="sculpy-chat-root"'));
 assert.match(app,/sculpyDashboard\.render\(turns\)/);
 assert.match(chat,/onTurnsChanged\(turns, scope\)/);
 assert.match(dashboard,/latest=newest\.analysisCharts/);
 assert.match(dashboard,/latest=null;render\(\[\]\)/);
});
test('three default diagram questions use the same full fictional catalog',()=>{
 for(const question of ['300单服务订单占比','300单各渠道收款金额饼图','300单化妆师订单占比']){
  const charts=buildAnalysisCharts({message:question,bookings,day:'2026-10-13'});
  assert.ok(charts.length>0,question);
  assert.equal(charts[0].fictional,true,question);
  assert.equal(charts[0].from,'2026-01-01',question);
  assert.equal(charts[0].to,'2026-12-31',question);
 }
});
