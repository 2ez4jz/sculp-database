import test from 'node:test';
import assert from 'node:assert/strict';
import {bookings} from '../src/data/demo.js';
import {demoReport} from '../supabase/functions/sculpy-chat/demo-report.js';

// Independent ledger reconciliation against the 300 fictional source rows.
// Never execute against real customer data.
const base={from:'2026-01-01',to:'2026-01-31',service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:null};
const cents=b=>typeof b.price==='number'&&Number.isFinite(b.price)&&b.price>=0&&Number.isSafeInteger(Math.round(b.price*100))&&Math.abs(b.price*100-Math.round(b.price*100))<1e-6?Math.round(b.price*100):null;
const amount=(rows,key)=>rows.reduce((sum,row)=>sum+key(row),0);
const report=(from,to,patch={},rows=bookings)=>demoReport(rows,{...base,from,to,...patch},'2026-10-13');
test('V2.1: each calendar month independently reconciles order values and dated receipts',()=>{
 assert.equal(bookings.length,300);
 for(let month=1;month<=12;month++){
  const from='2026-'+String(month).padStart(2,'0')+'-01';
  const to='2026-'+String(month).padStart(2,'0')+'-'+String(new Date(Date.UTC(2026,month,0)).getUTCDate()).padStart(2,'0');
  const actual=report(from,to);
  const services=bookings.filter(b=>b.date>=from&&b.date<=to);
  const completed=services.filter(b=>b.status==='Completed');
  const receipts=bookings.filter(b=>b.paidDate>=from&&b.paidDate<=to&&(!b.currency||b.currency==='CAD')&&Number.isSafeInteger(b.paidCents)&&b.paidCents>=0);
  assert.equal(actual.records,services.length,from+' orders');
  assert.equal(actual.completed,completed.length,from+' completed');
  assert.equal(actual.completedAmountCents,amount(completed.filter(b=>(!b.currency||b.currency==='CAD')&&cents(b)!==null),b=>cents(b)),from+' service value');
  assert.equal(actual.grossReceivedCents,amount(receipts,b=>b.paidCents),from+' gross original receipts');
  assert.equal(actual.unpricedCompleted,completed.filter(b=>cents(b)===null).length,from+' missing prices');
  for(const groupBy of ['channel','service','artist']){
   const groups=report(from,to,{groupBy}).groups;
   for(const key of ['records','completed','completedAmountCents','grossReceivedCents'])assert.equal(amount(groups,g=>g[key]),actual[key],from+' '+groupBy+' '+key);
  }
 }
});
test('V2.1: collaborators do not double overall booking value',()=>{
 const multiple=bookings.find(b=>b.artistIds?.length>1);
 assert.ok(multiple,'fixture needs a shared booking');
 const r=report(multiple.date,multiple.date,{bookingId:multiple.id});
 assert.equal(r.records,1);
 assert.equal(r.completedAmountCents,multiple.status==='Completed'?(cents(multiple)||0):0);
 for(const id of multiple.artistIds){
  const participating=report(multiple.date,multiple.date,{bookingId:multiple.id,artistId:id});
  assert.equal(participating.records,1,'each collaborator can find one shared booking');
 }
});
test('V2.1: no price or undocumented refunds can become net profit',()=>{
 const b=bookings.find(b=>b.status==='Completed');
 assert.ok(b);
 const altered=structuredClone(bookings);
 const item=altered.find(x=>x.id===b.id);
 item.price=null;
 const r=report(item.date,item.date,{bookingId:item.id},altered);
 assert.equal(r.unpricedCompleted,1);
 assert.equal(r.completedAmountCents,0);
 assert.equal(r.limitations.profitUnavailable,true);
 assert.equal(r.limitations.netReceiptsUnavailable,true);
 assert.equal(r.artistGrouping,'primary_artist_only; artistId filter includes collaborators');
});
