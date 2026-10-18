import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './support/cloud-database.mjs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),ops=id(2),artist=id(3),inactive=id(4),client=id(10),wedding=id(20);
async function fixture(db){
 for(const [user,role,active] of [[owner,'owner',true],[ops,'operations',true],[artist,'artist',true],[inactive,'owner',false]]){
  await db.query('insert into auth.users(id) values($1)',[user]);await db.query('insert into profiles(id,display_name,role,active) values($1,$2,$2::text::public.app_role,$3)',[user,role,active]);
 }
 await db.query("insert into clients(id,display_name) values($1,'Fictional fixture')",[client]);
 const services=(await db.query("select id from services where code='wedding'")).rows;return services[0].id;
}
async function as(db,user,role='authenticated'){await db.exec(`reset role;set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);}
async function booking(db,n,service,day='2027-07-10T14:00:00Z'){
 await db.exec('reset role');await db.query("insert into bookings(id,client_id,service_id,starts_at) values($1,$2,$3,$4)",[id(n),client,service,day]);await as(db,owner);return id(n);
}
const detail=(db,b)=>db.query('select sculpy_wedding_detail($1) d',[b]).then(r=>r.rows[0].d);
async function command(db,action,payload,request=crypto.randomUUID()) {return (await db.query('select sculpy_wedding_command($1,$2,$3) d',[request,action,{confirmed:true,reason:'Fictional verified test evidence',...payload}])).rows[0].d;}
const confirm=async(db,b,amount=2000,date='2026-09-12')=>command(db,'confirm_contract',{bookingId:b,version:(await detail(db,b)).version,amount,effectiveAt:date,dateQuality:date?'verified':'unknown'});
const report=(db,f='2026-10-01',t='2026-10-18',source=null,service=null)=>db.query('select sculpy_wedding_report($1,$2,$3,$4,$5,$6) d',[f,t,'2026-10-18',2027,source,service]).then(r=>r.rows[0].d);

test('separate signing, service, receipts; partial refunds, amendments, replay and immutable event audit',async()=>{
 const db=await createDatabase();try{
  const service=await fixture(db),b=await booking(db,40,service);await confirm(db,b);
  let d=await detail(db,b);assert.equal(d.status,'confirmed');assert.equal(d.receivedCents,'0');assert.equal(d.outstandingCents,'200000');
  const req=crypto.randomUUID(),payment={bookingId:b,kind:'deposit',amount:600,paidAt:'2026-09-20',method:'etransfer',reference:'fictional-deposit'};
  const p=await command(db,'record_payment',payment,req);assert.equal((await command(db,'record_payment',payment,req)).replayed,true);
  await assert.rejects(()=>command(db,'record_payment',{...payment,amount:601},req),e=>e.code==='23505');
  await assert.rejects(()=>command(db,'record_payment',payment),e=>e.code==='23505');
  await command(db,'amend_contract',{bookingId:b,version:d.version,amount:2500,effectiveAt:'2026-10-02'});
  await command(db,'record_payment',{bookingId:b,kind:'balance',amount:1900,paidAt:'2026-10-05',method:'etransfer'});
  await command(db,'record_payment',{bookingId:b,kind:'refund',amount:200,paidAt:'2026-10-10',method:'etransfer',refundOf:p.paymentId});
  await assert.rejects(()=>command(db,'record_payment',{bookingId:b,kind:'refund',amount:401,paidAt:'2026-10-10',method:'cash',refundOf:p.paymentId}),/累计退款/);
  d=await detail(db,b);assert.equal(d.amountCents,'250000');assert.equal(d.receivedCents,'230000');assert.equal(d.outstandingCents,'20000');assert.equal(d.payments.length,3);
  const sept=await report(db,'2026-09-01','2026-09-30');assert.equal(sept.sales.count,1);assert.equal(sept.sales.signedCents,'200000');assert.equal(sept.cash.netCents,'60000');
  const oct=await report(db);assert.equal(oct.sales.count,0);assert.equal(oct.sales.changeCents,'50000');assert.equal(oct.cash.netCents,'170000');assert.equal(oct.forward.amountCents,'250000');assert.equal(oct.forward.months[0].month,'2027-07');assert.equal(oct.bookingPace.comparable,false);assert(!('count' in oct.bookingPace.peer));
  await db.exec('reset role');assert.equal((await db.query('select confirmed_at::date d from bookings where id=$1',[b])).rows[0].d.toISOString().slice(0,10),'2026-09-12');
  await assert.rejects(()=>db.query('update booking_business_events set amount=0 where booking_id=$1',[b]),/append-only/);
  await assert.rejects(()=>db.query("update payments set amount=1 where id=$1",[p.paymentId]),/不可覆盖/);
 }finally{await db.close();}
});

test('cancellation retains signing; date edits preserve as-of price/month/state; unknown history never fakes pace',async()=>{
 const db=await createDatabase();try{
  const service=await fixture(db),b=await booking(db,41,service);await confirm(db,b,1800,'2026-08-20');
  await command(db,'cancel_contract',{bookingId:b,version:(await detail(db,b)).version,effectiveAt:'2026-09-16'});
  let r=await report(db,'2026-08-01','2026-09-30');assert.equal(r.sales.count,1);assert.equal(r.sales.signedCents,'180000');assert.equal(r.sales.cancelledCents,'180000');assert.equal(r.sales.netChangeCents,'0');assert.equal(r.forward.count,0);
  const unknown=await booking(db,42,service,'2027-08-10T14:00:00Z');await confirm(db,unknown,3000,null);
  r=await report(db);assert.equal(r.coverage.unknownConfirmationDates,1);assert.equal(r.sales.count,0);assert.equal(r.forward.count,1);assert.equal(r.bookingPace.comparable,false);
  const b2=await booking(db,43,service,'2027-06-15T14:00:00Z');await confirm(db,b2,2000,'2026-09-10');
  await command(db,'amend_contract',{bookingId:b2,version:(await detail(db,b2)).version,amount:2200,effectiveAt:'2026-10-04'});
  await db.exec("reset role;update sculpy_private.wedding_coverage set starts_at='2025-01-01';");
  let pace=(await db.query("select sculpy_private.booking_pace('2026-10-01T04:00:00Z',2027) d")).rows[0].d;
  assert.equal(pace.amountCents,'200000');assert.equal(pace.months[0].month,'06');
  await db.query("update bookings set starts_at='2027-07-15T14:00:00Z' where id=$1",[b2]);
  pace=(await db.query("select sculpy_private.booking_pace('2026-10-01T04:00:00Z',2027) d")).rows[0].d;assert.equal(pace.amountCents,'200000');assert.equal(pace.months[0].month,'06');
  await as(db,owner);r=await report(db);assert.equal(r.forward.months.find(m=>m.month==='2027-07').amount_cents,'220000');
 }finally{await db.close();}
});

test('lead cohorts, open/lost/invalid, real conversion date, source attribution and distinct contracts',async()=>{
 const db=await createDatabase();try{
  const service=await fixture(db),b=await booking(db,44,service);await confirm(db,b,2000,'2026-09-12');
  const base={name:'Fictional lead',email:'fixture@example.test',contact:'',service:'Bridal',serviceType:'wedding',source:'instagram',status:'won',bookingId:b,firstContact:'2026-08-01'};
  const l=await command(db,'save_lead',base);
  await command(db,'save_lead',{...base,status:'pending',bookingId:null,email:null,contact:'WeChat fixture'});
  await command(db,'save_lead',{...base,status:'lost',bookingId:null,lostReason:'预算不符'});
  await command(db,'save_lead',{...base,status:'spam',bookingId:null});
  await command(db,'save_lead',{...base,source:'google'});
  let r=await report(db,'2026-08-01','2026-08-31');assert.equal(r.leads.count,4);assert.equal(r.leads.won,2);assert.equal(r.leads.open,1);assert.equal(r.leads.lost,1);assert.equal(r.leads.invalid,1);assert.equal(r.leads.conversionPercent,50);assert.equal(r.leads.signedCents,'200000');assert.equal(r.leads.distinctContracts,1);assert.equal(r.leads.averageDaysToWon,42);
  assert.equal(r.leads.sources.find(s=>s.source==='google').signed_cents,'0');
  r=await report(db,'2026-08-01','2026-08-31','instagram','wedding');assert.equal(r.leads.count,3);assert.equal(r.leads.won,1);assert.equal(r.leads.conversionPercent,33.33);
  await assert.rejects(()=>command(db,'save_lead',{...base,id:l.leadId,revision:1}),e=>e.code==='40001');
  await assert.rejects(()=>command(db,'save_lead',{...base,bookingId:null}),/成交须关联/);
  await assert.rejects(()=>command(db,'save_lead',{...base,firstContact:'2026-10-01'}),/首次询盘/);
 }finally{await db.close();}
});

test('role boundaries, table bypass, unknown keys, future payments and same-contract included services',async()=>{
 const db=await createDatabase();try{
  const service=await fixture(db),b=await booking(db,45,service),child=await booking(db,46,service,'2027-07-11T14:00:00Z');
  await command(db,'include_service',{bookingId:child,version:1,parentId:b});await assert.rejects(()=>confirm(db,child),/主合同/);await confirm(db,b);
  for(const user of [artist,inactive,null]){
   await as(db,user,user?'authenticated':'anon');
   await assert.rejects(()=>report(db));await assert.rejects(()=>detail(db,b));await assert.rejects(()=>command(db,'record_payment',{bookingId:b}));
   await assert.rejects(()=>db.query('select * from booking_business_events'));await assert.rejects(()=>db.query('update website_enquiries set status=\'won\''));
   await assert.rejects(()=>db.query("select sculpy_submit_website_enquiry('{}','x')"));
  }
  await as(db,ops);assert.equal((await report(db)).forward.count,1);
  await assert.rejects(()=>command(db,'amend_contract',{bookingId:b,version:2,amount:2500,effectiveAt:'2026-10-01',extra:true}),/不支持/);
  await assert.rejects(()=>command(db,'record_payment',{bookingId:b,amount:1,kind:'deposit',paidAt:'2027-01-01',method:'cash'}),/日期无效/);
  await db.exec('reset role');await assert.rejects(()=>db.query("update bookings set status='inquiry' where id=$1",[b]),/真实日期/);
  await assert.rejects(()=>db.query("update bookings set confirmed_at=now() where id=$1",[b]),/真实日期/);
 }finally{await db.close();}
});

test('durable website intake, strict retries, source mapping, throttling and anonymous read isolation',async()=>{
 const db=await createDatabase();try{
  await fixture(db);await as(db,null,'service_role');
  const payload={submission_id:crypto.randomUUID(),name:'Fictional enquiry',email:'intake@example.test',service:'Bridal',event_date:'2027-07-01',location:'Toronto',details:'Fixture',contact:''};
  const submit=p=>db.query('select sculpy_submit_website_enquiry($1,$2) d',[p,'a'.repeat(64)]).then(r=>r.rows[0].d);
  assert.equal((await submit(payload)).ok,true);assert.equal((await submit(payload)).duplicate,true);
  await assert.rejects(()=>submit({...payload,name:'Changed'}),e=>e.code==='23505');
  await submit({...payload,submission_id:crypto.randomUUID()});await submit({...payload,submission_id:crypto.randomUUID()});
  await assert.rejects(()=>submit({...payload,submission_id:crypto.randomUUID()}),e=>e.code==='P0429');
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from website_enquiries')).rows[0].n,3);assert.equal((await db.query('select service_type from website_enquiries limit 1')).rows[0].service_type,'wedding');
  await as(db,null,'anon');await assert.rejects(()=>db.query('select * from website_enquiries'));
 }finally{await db.close();}
});

test('PostgreSQL concurrent receipt replay and cumulative refund protection',async t=>{
 const db=await createDatabase();try{
  if(!db.connect){t.skip('Multi-connection verification runs in PostgreSQL CI.');return;}
  const service=await fixture(db),b=await booking(db,50,service);await confirm(db,b);
  const a=await db.connect(),c=await db.connect();try{
   await as(a,owner);await as(c,owner);
   const req=crypto.randomUUID(),payload={bookingId:b,kind:'deposit',amount:100,paidAt:'2026-09-20',method:'cash'};
   const results=await Promise.all([command(a,'record_payment',payload,req),command(c,'record_payment',payload,req)]);
   assert.deepEqual(results.map(x=>x.replayed).sort(),[false,true]);
   const refund={bookingId:b,kind:'refund',amount:60,paidAt:'2026-10-10',method:'cash',refundOf:results[0].paymentId};
   const refunds=await Promise.allSettled([command(a,'record_payment',{...refund,reference:'refund-A'}),command(c,'record_payment',{...refund,reference:'refund-B'})]);
   assert.equal(refunds.filter(x=>x.status==='fulfilled').length,1);assert.equal((await detail(db,b)).receivedCents,'4000');
  }finally{await a.end();await c.end();}
 }finally{await db.close();}
});

test('priced service breakdown stays one contract; unknown prices stay incomplete and currency is checked',async()=>{
 const db=await createDatabase();try{
  const service=await fixture(db),b=await booking(db,51,service);await db.exec('reset role');
  await db.query("insert into booking_services(booking_id,description,unit_price) values($1,'Wedding + trial',1800),($1,'Family styling',200)",[b]);
  await as(db,owner);await confirm(db,b,2000);
  await command(db,'amend_contract',{bookingId:b,version:(await detail(db,b)).version,amount:2500,effectiveAt:'2026-10-02'});
  assert.equal((await detail(db,b)).amountCents,'250000');const r=await report(db);assert.equal(r.sales.changeCents,'50000');assert.equal(r.forward.count,1);assert.equal(r.forward.amountCents,'250000');
  const unknown=await booking(db,52,service,'2027-08-01T14:00:00Z');await confirm(db,unknown,null);
  const partial=await report(db,'2026-09-01','2026-09-30');assert.equal(partial.sales.count,2);assert.equal(partial.sales.signedCents,'200000');assert.equal(partial.sales.unknownAmountCount,1);assert.equal(partial.forward.unknownAmountCount,1);
  await db.exec('reset role');await db.query("insert into invoices(id,booking_id,currency) values($1,$2,'USD')",[id(60),b]);
  await as(db,owner);await assert.rejects(()=>command(db,'record_payment',{bookingId:b,kind:'balance',amount:100,paidAt:'2026-10-05',method:'cash',invoiceId:id(60)}),/币种/);
 }finally{await db.close();}
});

test('technical acceptance probes remain outside business views and every enquiry metric',async()=>{
 const db=await createDatabase();try{
  await fixture(db);await db.query("insert into website_enquiries(submission_id,name,email,service,details) values($1,'SCULPY V2.3 internal acceptance','sculpy-v23-acceptance@example.test','Bridal','Synthetic API acceptance probe; not a customer')",[crypto.randomUUID()]);
  await as(db,owner);assert.equal((await db.query('select count(*)::int n from website_enquiries_business')).rows[0].n,0);
  const r=await report(db);assert.equal(r.leads.count,0);assert.equal(r.leads.invalid,0);assert.equal(r.leads.won,0);
  await as(db,null,'anon');await assert.rejects(()=>db.query('select * from website_enquiries_business'));
 }finally{await db.close();}
});
