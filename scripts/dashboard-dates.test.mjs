import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDashboardCharts,dashboardRange,validDashboardRange} from '../src/components/analysis/sculpy-dashboard.js';
import {bookings} from '../src/data/demo.js';

test('calendar ranges handle January rollover and leap-year month ends',()=>{
 assert.deepEqual(dashboardRange('month','2026-10-15'),{from:'2026-10-01',to:'2026-10-15'});
 assert.deepEqual(dashboardRange('last-month','2026-01-15'),{from:'2025-12-01',to:'2025-12-31'});
 assert.deepEqual(dashboardRange('last-month','2024-03-01'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(dashboardRange('year','2026-10-15'),{from:'2026-01-01',to:'2026-12-31'});
});
test('custom dates validate exact days and chronological order',()=>{
 for(const range of [{from:'2026-02-29',to:'2026-03-01'},{from:'2026-10-02',to:'2026-10-01'},{from:'',to:'2026-01-01'}]){
  assert.equal(validDashboardRange(range),false);assert.throws(()=>buildDashboardCharts(bookings,range),RangeError);
 }
 assert.equal(validDashboardRange({from:'2024-02-29',to:'2024-02-29'}),true);
});
test('three charts share selected inclusive dates and retain receipt date semantics',()=>{
 const rows=[
  {id:'a',date:'2026-08-01',paidDate:'2026-07-31',paidCents:11000,service:'Wedding',status:'Completed',price:110,channelId:'google',artistIds:['miranda']},
  {id:'b',date:'2026-08-31',paidDate:'2026-08-31',paidCents:22000,service:'Event',status:'Completed',price:220,channelId:'referral',artistIds:['emily']},
  {id:'c',date:'2026-09-01',paidDate:'2026-08-01',paidCents:33000,service:'Education',status:'Confirmed',price:330,channelId:'website',artistIds:['miranda']}
 ];
 const range={from:'2026-08-01',to:'2026-08-31'},charts=buildDashboardCharts(rows,range,'2026-10-15');
 assert.equal(charts.length,3);
 for(const c of charts){assert.equal(c.from,range.from);assert.equal(c.to,range.to);}
 assert.equal(charts[0].rows.reduce((n,r)=>n+r.value,0),2);
 assert.equal(charts[1].rows.reduce((n,r)=>n+r.value,0),55000);
 assert.equal(charts[2].rows.reduce((n,r)=>n+r.value,0),2);
 const oneDay=buildDashboardCharts(rows,{from:'2026-08-31',to:'2026-08-31'},'2026-10-15');
 assert.equal(oneDay[0].rows.reduce((n,r)=>n+r.value,0),1);
});
test('empty and multi-year custom ranges remain exact',()=>{
 const empty=buildDashboardCharts(bookings,{from:'2020-01-01',to:'2020-01-01'},'2026-10-15');
 assert.equal(empty.length,3);assert.ok(empty.every(c=>c.rows.every(r=>r.value===0)));
 const wide=buildDashboardCharts(bookings,{from:'2025-12-01',to:'2027-01-31'},'2026-10-15');
 assert.equal(wide[0].from,'2025-12-01');assert.equal(wide[0].to,'2027-01-31');
 assert.equal(wide[0].rows.reduce((n,r)=>n+r.value,0),300);
});
