import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './support/cloud-database.mjs';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const jz=id(1),owner=id(2),staff=id(3),other=id(4),inactive=id(5),reader=id(6),legacy=id(7);
const client=id(10),secondClient=id(11),artist=id(20),service=id(30),b1=id(40),b2=id(41);
async function seed(db) {
  for(const [user,role,active] of [[jz,'operations',true],[owner,'owner',true],[staff,'artist',true],
    [other,'artist',true],[inactive,'artist',false],[reader,'read_only',true],[legacy,'admin',true]]) {
    await db.query('insert into auth.users(id,email) values($1,$2)',[user,`${user}@example.test`]);
    await db.query('insert into profiles(id,display_name,role,active) values($1,$2,$3,$4)',[user,role,role,active]);
  }
  await db.exec(`insert into artists(id,slug,profile_id,name,level) values('${artist}','qa_artist','${staff}','QA Artist','Senior');
    insert into artists(id,slug,profile_id,name,level) values('${id(21)}','qa_inactive','${inactive}','Inactive','Senior');
    insert into services(id,code,name) values('${service}','qa_service','QA Service');
    insert into clients(id,display_name) values('${client}','QA Client'),('${secondClient}','QA Other');
    insert into bookings(id,client_id,service_id,starts_at,ends_at,status,price_cad,budget_cad,preparation_address,service_details)
    values('${b1}','${client}','${service}','2026-09-15T12:00:31.25Z','2026-09-15T14:00:31.25Z','completed',1000,1800,'Toronto','Initial service'),
    ('${b2}','${secondClient}','${service}','2026-10-15T12:00:00Z',null,'confirmed',2000,null,'Other city',null);
    insert into booking_artists(booking_id,artist_id) values('${b1}','${artist}'),('${b1}','${id(21)}');
    insert into booking_intakes(request_id,created_by,booking_id,client_id,raw_text,recorded_at,confirmed_payload)
    values('${id(50)}','${owner}','${b1}','${client}','  private original source  ','2026-09-01T10:00:00Z','{}');`);
}
async function as(db,user,role='authenticated') {
  await db.exec(`reset role;set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
}
const detail=(db,booking=b1)=>db.query('select sculpy_order_detail($1) as data',[booking]).then(r=>r.rows[0].data);
const payload=edit=>Object.fromEntries(['date','time','endDate','endTime','location','details','status'].map(k=>[k,edit[k]]));
const change=(db,request,booking,version,values,reason='Confirmed by QA')=>db.query(
  'select sculpy_confirm_booking_change($1,$2,$3,$4,$5) as data',[request,booking,version,{...values,confirmed:true},reason]
).then(r=>r.rows[0].data);
const report=(db,month='2026-09')=>db.query('select sculpy_monthly_report($1) as data',[month]).then(r=>r.rows[0].data);

test('full migration chain: canonical table access, role matrix, disabled accounts and source isolation',async()=>{
  const db=await createDatabase();
  try {
    await seed(db);
    for(const user of [jz,owner,staff,other,inactive,reader,legacy]) {
      await as(db,user);
      for(const table of ['bookings','clients','client_private','booking_artists','booking_services','artist_compensations','services','venues','partners','invoices','payments','booking_financials','service_revenue_monthly']) {
        await assert.rejects(()=>db.query(`select * from public.${table}`),/permission denied/,`${user}: ${table}`);
      }
      await assert.rejects(()=>db.query("update bookings set price_cad=1"),/permission denied/);
      if([jz,owner].includes(user)) {
        const data=await detail(db);assert(data.edit);assert.equal(data.intake.rawText,'  private original source  ');
        assert.equal(data.bookings[0].budget_cad,1800);assert.equal((await report(db)).bookings.completedAmountCents,'100000');
      } else {
        await assert.rejects(()=>report(db),/仅管理员/);
        await assert.rejects(()=>change(db,crypto.randomUUID(),b1,1,{}),/仅管理员/);
        await assert.rejects(()=>db.query("select sculpy_intake_lookup('QA Client')"),/仅管理员/);
        await assert.rejects(()=>detail(db,b2));
        if(user===staff) {
          const data=await detail(db);assert.equal(data.bookings.length,1);assert(!data.edit);assert(!data.intake);
          assert(!('price_cad' in data.bookings[0]));assert(!('budget_cad' in data.bookings[0]));
        } else await assert.rejects(()=>detail(db));
      }
    }
    await as(db,owner);
    const ai=(await db.query('select sculpy_context($1) as data',[b1])).rows[0].data;
    assert(!ai.intake);assert(!ai.edit);assert(!('service_details' in ai.bookings[0]));assert(!('budget_cad' in ai.bookings[0]));
    assert.equal((await db.query('select count(*)::int as n from audit_events')).rows[0].n,0);
    await as(db,jz);assert((await db.query('select count(*)::int as n from audit_events')).rows[0].n>0);
    await as(db,null,'anon');
    for(const sql of ['select sculpy_order_detail($1)','select sculpy_context($1)'])await assert.rejects(()=>db.query(sql,[b1]),/permission denied/);
    await assert.rejects(()=>report(db),/permission denied/);
    await assert.rejects(()=>db.query('select * from bookings'),/permission denied/);
    await as(db,jz);await db.query('select update_managed_account($1,$2,$3,$4)',[staff,'QA Artist','artist',false]);
    await as(db,staff);await assert.rejects(()=>detail(db),/Active account/);
  } finally {await db.close();}
});

test('confirmed edits preserve timestamps, reject stale writes, deduplicate retry and audit exact before/after',async()=>{
  const db=await createDatabase();
  try {
    await seed(db);await as(db,owner);
    let edit=(await detail(db)).edit;
    const values={...payload(edit),location:'Markham <script>test</script>'},request=crypto.randomUUID();
    const first=await change(db,request,b1,edit.version,values,'  原文修改依据\n  ');
    assert.equal(first.version,2);assert.equal(first.replayed,false);
    assert.equal((await change(db,request,b1,edit.version,values,'  原文修改依据\n  ')).replayed,true);
    let data=await detail(db);assert.equal(data.bookings[0].venue,values.location);
    assert.equal(new Date(data.bookings[0].starts_at).toISOString(),'2026-09-15T12:00:31.250Z');
    assert.equal(data.intake.rawText,'  private original source  ');assert.equal(data.bookings[0].price_cad,1000);
    await assert.rejects(()=>change(db,crypto.randomUUID(),b1,1,values),e=>e.code==='40001');
    await assert.rejects(()=>change(db,request,b1,1,{...values,details:'different'},'  原文修改依据\n  '),e=>e.code==='23505');
    await as(db,jz);await assert.rejects(()=>change(db,request,b1,1,values,'  原文修改依据\n  '),e=>e.code==='23505');
    const records=(await db.query('select * from booking_changes where request_id=$1',[request])).rows;
    assert.equal(records.length,1);assert.equal(records[0].reason,'  原文修改依据\n  ');
    assert.equal(records[0].before_value.edit_version,1);assert.equal(records[0].after_value.edit_version,2);
    assert.equal((await db.query("select count(*)::int as n from audit_events where entity_id=$1 and action='update'",[b1])).rows[0].n,1);
    edit=data.edit;
    for(const overrides of [{date:'2026-02-30'},{time:'25:00'},{date:'2026-03-08',time:'02:30'},
      {date:'2026-11-01',time:'01:30'},{endDate:'',endTime:'09:00'},
      {endDate:edit.date,endTime:'07:00'},{status:'paid'},{status:'confirmed'},{price_cad:'1'},{confirmed:false}]) {
      await assert.rejects(()=>db.query('select sculpy_confirm_booking_change($1,$2,$3,$4,$5)',
        [crypto.randomUUID(),b1,edit.version,{...payload(edit),confirmed:true,...overrides},'test']));
    }
    await assert.rejects(()=>change(db,crypto.randomUUID(),b1,edit.version,payload(edit),' '));
    // Whole function statement (including existing audit trigger) rolls back.
    await db.exec(`reset role;create function fail_change_test() returns trigger language plpgsql as $$begin raise exception 'late write failure';end$$;
      create trigger fail_change before insert on booking_changes for each row execute function fail_change_test();`);
    await as(db,owner);await assert.rejects(()=>change(db,crypto.randomUUID(),b1,edit.version,{...payload(edit),details:'Must rollback'}),/late write failure/);
    assert.equal((await detail(db)).edit.version,edit.version);assert.equal((await detail(db)).edit.details,edit.details);
    await db.exec('reset role;drop trigger fail_change on booking_changes;');
    await as(db,owner);
    const reopened=await change(db,crypto.randomUUID(),b1,edit.version,{...payload(edit),status:'inquiry'});
    assert.equal(reopened.version,3);
    const v3=(await detail(db)).edit;
    await assert.rejects(()=>change(db,crypto.randomUUID(),b1,3,{...payload(v3),status:'completed'}),/先重新打开或确认/);
    await change(db,crypto.randomUUID(),b1,3,{...payload(v3),status:'confirmed',date:'2026-10-06',endDate:'2026-10-06'});
    assert.equal((await report(db,'2026-10')).bookings.confirmed,2);
    const updated=(await detail(db)).edit;
    await db.exec(`reset role;insert into bookings(id,client_id,service_id,starts_at,status)
      values('${id(46)}','${client}','${service}','2026-10-16T12:00:00Z','confirmed');`);
    await as(db,owner);
    await assert.rejects(()=>change(db,crypto.randomUUID(),b1,updated.version,
      {...payload(updated),date:'2026-10-16',endDate:'2026-10-16'}),/当天已有同类订单/);
    assert.equal((await detail(db)).edit.version,updated.version);
    await change(db,crypto.randomUUID(),b1,updated.version,{...payload(updated),status:'cancelled'});
    assert.equal((await report(db,'2026-10')).bookings.cancelled,1);
  } finally {await db.close();}
});

test('cloud month report: Toronto boundaries, line totals, missing prices, gross receipts and refund limitations',async()=>{
  const db=await createDatabase();
  try {
    await seed(db);
    await db.exec(`insert into bookings(id,client_id,starts_at,status,price_cad,currency) values
      ('${id(42)}','${client}','2026-10-01T03:59:59Z','completed',null,'CAD'),
      ('${id(43)}','${client}','2026-10-01T04:00:00Z','completed',50,'CAD'),
      ('${id(44)}','${client}','2026-09-20T12:00:00Z','completed',999,'CAD'),
      ('${id(45)}','${client}','2026-09-20T12:00:00Z','completed',200,'USD');
      insert into booking_services(booking_id,description,unit_price) values('${id(44)}','Line 1',0.10),('${id(44)}','Line 2',0.20);
      insert into invoices(id,booking_id,subtotal,status) values('${id(60)}','${b1}',1000,'issued');
      insert into payments(invoice_id,amount,currency,method,status,paid_at) values
      ('${id(60)}',100,'CAD','cash','succeeded','2026-10-01T03:59:59Z'),
      ('${id(60)}',200,'CAD','cash','succeeded','2026-10-01T04:00:00Z'),
      ('${id(60)}',30,'CAD','cash','partially_refunded','2026-09-20T12:00:00Z'),
      ('${id(60)}',20,'CAD','cash','refunded','2026-09-20T12:00:00Z'),
      ('${id(60)}',90,'CAD','cash','failed','2026-09-20T12:00:00Z'),
      ('${id(60)}',45,'CAD','cash','pending','2026-09-20T12:00:00Z'),
      ('${id(60)}',15,'CAD','cash','succeeded',null),
      ('${id(60)}',10,'USD','cash','succeeded','2026-09-20T12:00:00Z');
      insert into invoices(id,booking_id,subtotal,deleted_at) values('${id(61)}','${b1}',500,now());
      insert into payments(invoice_id,amount,method,status,paid_at) values('${id(61)}',500,'cash','succeeded','2026-09-20T12:00:00Z');`);
    await as(db,owner);
    const sept=await report(db);assert.equal(sept.timezone,'America/Toronto');
    assert.equal(sept.bookings.completed,4);assert.equal(sept.bookings.completedAmountCents,'100030');
    assert.equal(sept.bookings.unpriced,1);assert.equal(sept.bookings.nonCadCompleted,1);
    assert.deepEqual(sept.receipts,{grossAmountCents:'15000',count:3,refundReviewCount:2,nonCadCount:1});
    assert.equal(sept.undatedReceiptCount,1);
    const oct=await report(db,'2026-10');assert.equal(oct.bookings.completedAmountCents,'5000');assert.equal(oct.receipts.grossAmountCents,'20000');
    const empty=await report(db,'2026-12');assert.equal(empty.bookings.total,0);assert.equal(empty.receipts.grossAmountCents,'0');
    for(const month of [null,'2026-13','2026-1','2026-09;select 1','1999-12'])await assert.rejects(()=>report(db,month));
  } finally {await db.close();}
});

test('two PostgreSQL connections: concurrent edits conflict; simultaneous retry executes only once',async t=>{
  const db=await createDatabase();
  try {
    if(!db.connect){t.skip('Multi-connection locking requires SCULPY_TEST_DATABASE_URL; covered by PostgreSQL CI job.');return;}
    await seed(db);await as(db,owner);let edit=(await detail(db)).edit;
    const a=await db.connect(),b=await db.connect();
    try {
      await as(a,owner);await as(b,owner);
      const results=await Promise.allSettled([
        change(a,crypto.randomUUID(),b1,1,{...payload(edit),details:'Window A'}),
        change(b,crypto.randomUUID(),b1,1,{...payload(edit),details:'Window B'}),
      ]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'40001');
      edit=(await detail(db)).edit;
      const request=crypto.randomUUID(),values={...payload(edit),details:'Same retry'};
      const retry=await Promise.all([change(a,request,b1,edit.version,values),change(b,request,b1,edit.version,values)]);
      assert.deepEqual(retry.map(r=>r.replayed).sort(),[false,true]);
      assert.equal((await detail(db)).edit.version,3);
    } finally {await a.end();await b.end();}
  } finally {await db.close();}
});
