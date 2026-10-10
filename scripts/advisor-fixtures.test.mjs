import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAdvisorFixtures,fixtureSummary,FIXTURE_VERSION} from '../src/data/advisor-fixtures.js';
const a=generateAdvisorFixtures(),b=generateAdvisorFixtures(),s=fixtureSummary(a);
test('300 stable fictional orders, exact business mix',()=>{assert.equal(FIXTURE_VERSION,'sculp-300-v1');assert.equal(s.total,300);assert.deepEqual(s.counts,{bridal:100,occasion:110,lesson:60,commercial:30});assert.deepEqual(a,b);assert.equal(new Set(a.map(r=>r.id)).size,300);assert.ok(a.every(r=>r.fictional));});
test('bridal summer concentration and monthly checksum',()=>{assert.deepEqual(s.bridalByMonth,[2,2,4,6,12,16,19,18,12,5,2,2]);assert.equal(s.bridalByMonth.slice(4,9).reduce((x,y)=>x+y,0),77);});
test('lessons use actual recurring dates, not random dates',()=>{const lessons=a.filter(r=>r.service==='lesson');assert.equal(lessons.length,60);assert.equal(lessons.filter(r=>r.classSchedule==='weekly-wednesday-18').length,52);assert.equal(lessons.filter(r=>r.classSchedule==='monthly-second-sunday-13').length,8);for(const r of lessons){const date=new Date(r.month+'-'+r.startLocal.slice(8,10)+'T12:00:00Z');if(r.classSchedule.startsWith('weekly'))assert.equal(date.getUTCDay(),3);else {assert.equal(date.getUTCDay(),0);assert.ok(date.getUTCDate()>=8&&date.getUTCDate()<=14);}}});
test('report sums distinguish completed sales and received cash',()=>{assert.ok(s.completedCents>s.paidCents);assert.ok(s.paidCents>0);assert.equal(Object.values(s.channelsSummary).reduce((x,y)=>x+y,0),300);});
test('records are isolated and cannot mutate subsequent fixture runs',()=>{a[0].amountCents=-1;assert.ok(generateAdvisorFixtures()[0].amountCents>=0);});
