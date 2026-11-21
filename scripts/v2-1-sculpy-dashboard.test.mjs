import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bookings} from './fixtures/catalog/demo.js';
import {buildAnalysisCharts} from '../src/components/analysis/charts.js';
test('three default diagrams use the same full fictional catalog',()=>{
 for(const message of ['300单服务订单占比','300单各渠道收款金额饼图','300单化妆师订单占比']){
  const charts=buildAnalysisCharts({message,bookings,day:'2026-10-13'});
  assert.ok(charts.length>0,message);
  assert.equal(charts[0].fictional,true);
  assert.equal(charts[0].from,'2026-01-01');
  assert.equal(charts[0].to,'2026-12-31');
 }
});
