import test from 'node:test';
import assert from 'node:assert/strict';
import {demoReport,demoVisualSummary,compareDemoReports} from '../supabase/functions/sculpy-chat/demo-report.js';
import {buildAnalysisCharts} from '../src/components/analysis/charts.js';
const args={from:'2026-01-01',to:'2026-10-15',service:'Wedding',channelId:null,artistId:null,bookingId:null,status:null,groupBy:'venue',venueId:null};
const row=(id,venueId,price,status='Completed',extra={})=>({id,venueId,venueName:venueId+' Hall',price,status,service:'Wedding',date:'2026-08-01',artistIds:['miranda'],channelId:'google',...extra});
const data=[row('a','A',1000),row('b','A',3000),row('c','B',2500),row('d','A',null),row('e','A',9000,'Cancelled'),row('f','B',9900,'Confirmed'),row('g','C',null),row('h','D',2500),row('i','B',9900,'Completed',{currency:'USD'}),row('j',null,9999),row('k','Z',9999,'Completed',{date:'2026-12-01'})];
test('venue ranking uses exact priced completed average, sample counts, names and ties',()=>{
 const r=demoReport(data,args,'2026-10-15'),a=r.groups.find(g=>g.value==='A');
 assert.equal(a.pricedCompleted,2);assert.equal(a.averageCompletedAmountCents,200000);assert.equal(a.unpricedCompleted,1);
 assert.deepEqual(r.rankings.averageCompletedAmountCents.leaders.map(g=>g.value),['B','D']);
 assert.equal(r.rankings.averageCompletedAmountCents.maximum,250000);
 assert.equal(r.rankings.averageCompletedAmountCents.leaders[0].displayAverageCompletedAmount,'CAD 2,500.00');
 assert.equal(r.rankings.averageCompletedAmountCents.leaders[0].label,'B Hall');
 assert.equal(r.groups.find(g=>g.value==='C').averageCompletedAmountCents,null);
 assert.equal(r.groups.find(g=>g.value==='Z').averageCompletedAmountCents,null);
});
test('venue filtering composes with services, dates, artist and channel',()=>{
 const r=demoReport(data,{...args,venueId:'A',artistId:'miranda',channelId:'google'},'2026-10-15');
 assert.equal(r.records,4);assert.equal(r.pricedCompleted,2);assert.equal(r.averageCompletedAmountCents,200000);
 assert.throws(()=>demoReport(data,{...args,venueId:{}},'2026-10-15'));
 const empty=demoReport(data,{...args,venueId:'missing'},'2026-10-15');assert.equal(empty.averageCompletedAmountCents,null);assert.deepEqual(empty.rankings.averageCompletedAmountCents.leaders,[]);
});
test('venue average charts use non-additive bars and proper labels',()=>{
 const report=demoReport(data,args,'2026-10-15');
 const charts=buildAnalysisCharts({message:'场地婚礼客单价图表',bookings:data,reports:[report],day:'2026-10-15'});
 assert.equal(charts[0].title,'venue');assert.equal(charts[0].metric,'averageCompletedAmountCents');assert.equal(charts[0].kind,'bars');
 assert.equal(charts[0].rows.find(r=>r.label==='A Hall').value,200000);
});

test('legacy chart summary keeps averages separate from totals and unknowns',()=>{
 const r=demoReport(data,args,'2026-10-15'),text=demoVisualSummary(r,'场地婚礼客单价柱状图');
 assert.match(text,/A Hall CAD 2,000.00/);assert.match(text,/C Hall 无价格有效/);assert.doesNotMatch(text,/合计|%/);
 const peer={...r,averageCompletedAmountCents:null};assert.equal(compareDemoReports(r,peer).metrics.averageCompletedAmountCents.delta,null);
 assert.equal(compareDemoReports({...r,averageCompletedAmountCents:150000},{...r,averageCompletedAmountCents:100000}).metrics.averageCompletedAmountCents.delta,50000);
});
