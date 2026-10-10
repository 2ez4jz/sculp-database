import test from 'node:test';import assert from 'node:assert/strict';
import {generateAdvisorFixtures} from '../src/data/advisor-fixtures.js';
import {advisorMetrics,advisorInsight,proposeKnowledge} from '../src/domain/advisor-engine.js';
const rows=generateAdvisorFixtures();
for(const [label,params] of [['all',{}],['bridal',{service:'bridal'}],['lesson',{service:'lesson'}],['Google',{channel:'Google'}],['June',{month:'2026-06'}],['bridal Google June',{service:'bridal',channel:'Google',month:'2026-06'}]]){
 test('business/marketing/finance filter '+label,()=>{const m=advisorMetrics(rows,params);assert.equal(m.count,rows.filter(r=>(!params.service||r.service===params.service)&&(!params.channel||r.channel===params.channel)&&(!params.month||r.month===params.month)).length);assert.ok(m.receivedCents>=0);assert.ok(m.completedCents>=0);if(m.count<10)assert.equal(m.warning,'LOW_SAMPLE');});
}
test('explicitly qualified commercial insights',()=>{const x=advisorInsight(rows);assert.equal(x[0].evidence.orders,77);assert.equal(x[0].evidence.total,100);assert.match(x[1].explanation,/not necessarily/);});
test('knowledge cannot silently become business policy',()=>{const k=proposeKnowledge({text:'Maintain bridal prices',sourceId:'dialogue-1'});assert.equal(k.approved,false);assert.equal(k.mayBeUsedAsPolicy,false);assert.equal(proposeKnowledge({text:'ok',sourceId:'dialogue-2',actorConfirmed:true}).approved,true);assert.throws(()=>proposeKnowledge({text:'unsourced'}));});
