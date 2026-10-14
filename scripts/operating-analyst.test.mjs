import test from 'node:test';
import assert from 'node:assert/strict';
import {delta,diagnosePeriods,evaluateRecommendation} from '../src/domain/operating-analyst.js';
test('increase, decline and zero baseline do not invent growth',()=>{
 assert.deepEqual(delta(120,100),{current:120,prior:100,change:20,percent:20});
 assert.equal(delta(50,0).percent,null);
 assert.equal(delta(10.2,1),null);
});
test('missing or invalid report cannot produce a confident recommendation',()=>{
 assert.equal(diagnosePeriods({current:{records:4}}).status,'insufficient');
 assert.throws(()=>diagnosePeriods({current:{records:4},previous:{records:2},metric:'profit'}),/Unsupported metric/);
});
test('finance warning and unknown-price gate',()=>{
 const x=diagnosePeriods({current:{completedAmountCents:120000,records:7,unpricedCompleted:1},previous:{completedAmountCents:100000,records:8}});
 assert.equal(x.comparison.percent,20);assert.match(x.warnings.join(' '),/未知价格/);assert.match(x.warnings.join(' '),/样本/);
 const y=diagnosePeriods({current:{grossReceivedCents:1000,records:12},previous:{grossReceivedCents:800,records:12},metric:'grossReceivedCents'});
 assert.match(y.warnings.join(' '),/退款/);
});
test('recommendations remain proposals pending approval',()=>{
 assert.equal(evaluateRecommendation({action:'复核渠道'}).ready,false);
 assert.equal(evaluateRecommendation({evidence:'渠道月报',action:'复核渠道',expectedMetric:'确认率',reviewDate:'2026-11-01'}).proposal.status,'pending-approval');
});
