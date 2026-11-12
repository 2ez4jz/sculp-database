import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './support/cloud-database.mjs';
const id=n=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(db){
 for(const [n,role,active] of [[1,'operations',true],[2,'owner',true],[3,'artist',true],[4,'read_only',true],[5,'owner',false]]){
  await db.query('insert into auth.users(id) values($1)',[id(n)]);
  await db.query('insert into profiles(id,display_name,role,active) values($1,$2,$3,$4)',[id(n),'QA '+role,role,active]);
 }
}
async function as(db,n,role='authenticated'){
 await db.exec('reset role;set role '+role);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);
}
const overview=db=>db.query('select sculpy_os_overview() as d').then(r=>r.rows[0].d);
const task=(db,n,title='跟进客户',booking=null,client=null,confirmed=true)=>db.query('select sculpy_os_create_task($1,$2,$3,$4,$5,$6) as d',[id(n),title,'2026-11-12T12:00:00Z',booking,client,confirmed]).then(r=>r.rows[0].d);
const client=(db,n,name='New client',source='referral',confirmed=true)=>db.query('select sculpy_os_create_client($1,$2,$3,$4) as d',[id(n),name,source,confirmed]).then(r=>r.rows[0].d);
test('OS foundation: role matrix denies anonymous/staff/inactive users and direct writes',async()=>{
 const db=await createDatabase();try{
  await fixture(db);
  for(const n of [3,4,5,null]){
   await as(db,n,n?'authenticated':'anon');
   await assert.rejects(()=>overview(db));await assert.rejects(()=>task(db,40));await assert.rejects(()=>client(db,41));
   await assert.rejects(()=>db.query("select sculpy_os_clients('',0)"));
  }
  await as(db,1);let d=await overview(db);assert.equal(d.unfinishedOrders,0);assert.equal(d.pendingEnquiries,0);assert.equal(d.receivableCents,'0');
  await assert.rejects(()=>db.exec('truncate reminders'),/permission denied/);
  await assert.rejects(()=>db.exec("insert into clients(display_name) values('bypass')"),/permission denied/);
  await as(db,2);assert.equal((await overview(db)).unfinishedOrders,0);
 }finally{await db.close();}
});
test('OS foundation: confirmed client/task creation, exact retry, actor boundary, links and retained audit',async()=>{
 const db=await createDatabase();try{
  await fixture(db);await as(db,1);
  await assert.rejects(()=>client(db,10,'New client','referral',false));
  assert.equal((await client(db,10)).replayed,false);assert.equal((await client(db,10)).replayed,true);
  await assert.rejects(()=>client(db,10,'Different'),e=>e.code==='23505');
  await assert.rejects(()=>client(db,11,'new CLIENT'),e=>e.code==='23505');
  await assert.rejects(()=>task(db,20,' ',null,null));
  await assert.rejects(()=>task(db,20,'follow up',null,null,false));
  await assert.rejects(()=>task(db,20,'follow up',id(90),id(10)));
  await db.exec('reset role');
  await db.query("insert into bookings(id,client_id,starts_at,status) values($1,$2,'2026-11-13T12:00:00Z','confirmed')",[id(30),id(10)]);
  await db.query("insert into clients(id,display_name) values($1,'Other')",[id(12)]);
  await as(db,1);
  await assert.rejects(()=>task(db,20,'follow up',id(30),id(12)),/mismatch/);
  assert.equal((await task(db,20,'follow up',id(30),id(10))).replayed,false);
  assert.equal((await task(db,20,'follow up',id(30),id(10))).replayed,true);
  await assert.rejects(()=>task(db,20,'changed',id(30),id(10)),e=>e.code==='23505');
  const list=(await db.query("select sculpy_os_clients('new client',0) as d")).rows[0].d;
  assert.equal(list.total,1);assert.equal(list.clients[0].order_count,1);
  await assert.rejects(()=>db.query("select sculpy_os_clients('',-1)"));
  await as(db,2);await assert.rejects(()=>task(db,20,'follow up',id(30),id(10)),e=>e.code==='23505');
  const d=await overview(db);assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].booking_id,id(30));
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from audit_events where entity_type in ('client','reminder')")).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n,1);
 }finally{await db.close();}
});
test('OS foundation: exact all-service metrics, Toronto date/week, test leads excluded and refund balance',async()=>{
 const db=await createDatabase();try{
  await fixture(db);
  await db.query("insert into clients(id,display_name) values($1,'Fixture')",[id(10)]);
  const insert=async(n,status,currency,price,deleted=false)=>db.query(`insert into bookings(id,client_id,starts_at,status,currency,price_cad,deleted_at)
   values($1,$2,date_trunc('week',now() at time zone 'America/Toronto') at time zone 'America/Toronto'+interval '36 hours',$3,$4,$5,case when $6 then now() else null end)`,[id(n),id(10),status,currency,price,deleted]);
  await insert(20,'confirmed','CAD',1000);await insert(21,'confirmed','USD',300);await insert(22,'confirmed','CAD',null);
  await insert(23,'cancelled','CAD',1000);await insert(24,'completed','CAD',200);await insert(25,'inquiry','CAD',500);await insert(26,'confirmed','CAD',99,true);
  await db.query("insert into invoices(id,booking_id,subtotal) values($1,$2,1000)",[id(40),id(20)]);
  await db.query("insert into payments(id,invoice_id,amount,method,status,paid_at,payment_kind) values($1,$2,400,'etransfer','succeeded',now(),'deposit')",[id(41),id(40)]);
  await db.query("insert into payments(id,invoice_id,amount,method,status,paid_at,payment_kind,refund_of) values($1,$2,100,'etransfer','succeeded',now(),'refund',$3)",[id(42),id(40),id(41)]);
  await db.exec(`insert into website_enquiries(submission_id,name,email,contact,service,details,status,is_test) values
   ('40000000-0000-4000-8000-000000000070','Fixture','qa@example.test','','Wedding','QA','pending',false),
   ('40000000-0000-4000-8000-000000000071','Fixture','qa@example.test','','Wedding','QA','spam',true)`);
  await db.exec(`insert into reminders(reason,due_at) values('today',((now() at time zone 'America/Toronto')::date+time '23:59') at time zone 'America/Toronto'),('overdue',((now() at time zone 'America/Toronto')::date-1+time '23:59') at time zone 'America/Toronto')`);
  await as(db,1);const d=await overview(db);
  assert.equal(d.pendingEnquiries,1);assert.equal(d.followupCount,1);assert.equal(d.weekBookings,3);
  assert.equal(d.unfinishedOrders,4);assert.equal(d.todayTasks,1);assert.equal(d.overdueTasks,1);
  assert.equal(d.receivableCents,'90000');assert.equal(d.receivableUnknown,2);
 }finally{await db.close();}
});
