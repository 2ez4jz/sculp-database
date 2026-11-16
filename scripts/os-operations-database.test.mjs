import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './support/cloud-database.mjs';
const id=n=>`31000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(db){
  for(const [n,role,active] of [[1,'operations',true],[2,'owner',true],[3,'artist',true],[4,'read_only',true],[5,'owner',false]]){
    await db.query('insert into auth.users(id) values($1)',[id(n)]);
    await db.query('insert into profiles(id,display_name,role,active) values($1,$2,$3,$4)',[id(n),'QA '+role,role,active]);
  }
  await db.query("insert into clients(id,display_name,referral_source) values($1,'QA customer','Instagram'),($2,'Removed customer','Referral')",[id(10),id(11)]);
  await db.query("update clients set deleted_at=now() where id=$1",[id(11)]);
  await db.query("insert into client_private(client_id,email,phone,internal_notes) values($1,'qa@example.test','416-555-0100','Private QA note')",[id(10)]);
  await db.query("insert into reminders(id,reason,due_at,client_id,assigned_to) values($1,'Follow up','2026-11-16T17:00:00Z',$2,$3)",[id(20),id(10),id(1)]);
}
async function as(db,n,role='authenticated'){
  await db.exec('reset role;set role '+role);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);
}
const update=(db,request=30,version=1,action='complete',due=null,confirmed=true)=>db.query('select sculpy_os_update_task($1,$2,$3,$4,$5,$6) as d',[id(request),id(20),version,action,due,confirmed]).then(r=>r.rows[0].d);
const list=db=>db.query("select sculpy_os_tasks('open',0) as d").then(r=>r.rows[0].d);
const detail=db=>db.query('select sculpy_os_client_detail($1,0) as d',[id(10)]).then(r=>r.rows[0].d);

test('OS operations SQL: anonymous/staff/inactive roles cannot read clients, tasks or command data',async()=>{
  const db=await createDatabase();try{
    await fixture(db);
    for(const n of [3,4,5,null]){
      await as(db,n,n?'authenticated':'anon');
      await assert.rejects(()=>list(db));await assert.rejects(()=>detail(db));await assert.rejects(()=>update(db));
      await assert.rejects(()=>db.query('select sculpy_private.os_client_detail($1,0)',[id(10)]));
    }
    await as(db,1);assert.equal((await list(db)).tasks[0].edit_version,'1');assert.equal((await detail(db)).contact.email,'qa@example.test');
    await assert.rejects(()=>db.exec('select * from sculpy_private.os_task_commands'),/permission denied/);
    await assert.rejects(()=>db.exec('truncate sculpy_private.os_task_commands'),/permission denied/);
    await as(db,2);assert.equal((await detail(db)).client.referral_source,'Instagram');
  }finally{await db.close();}
});
test('OS operations SQL: confirmation, idempotent commands, actor boundaries, conflicts and audit',async()=>{
  const db=await createDatabase();try{
    await fixture(db);await as(db,1);
    await assert.rejects(()=>update(db,30,1,'complete',null,false),e=>e.code==='22023');
    await assert.rejects(()=>update(db,30,1,'delete'),e=>e.code==='22023');
    const saved=await update(db);assert.equal(saved.version,'2');assert.equal(saved.status,'done');
    assert.equal((await update(db)).replayed,true);
    await assert.rejects(()=>update(db,30,1,'cancel'),e=>e.code==='23505');
    await assert.rejects(()=>update(db,31,1,'cancel'),e=>e.code==='40001');
    await as(db,2);await assert.rejects(()=>update(db),e=>e.code==='23505');
    assert.equal((await update(db,32,2,'reopen')).status,'open');
    assert.equal((await update(db,33,3,'cancel')).status,'dismissed');
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from sculpy_private.os_task_commands')).rows[0].n,3);
    assert.equal((await db.query("select count(*)::int n from audit_events where action like 'os_%'")).rows[0].n,3);
    assert.equal((await db.query('select count(*)::int n from reminders')).rows[0].n,1);
  }finally{await db.close();}
});
test('OS operations SQL: reschedule uses Toronto local date across DST and all writers increment revision',async()=>{
  const db=await createDatabase();try{
    await fixture(db);await as(db,1);
    await update(db,30,1,'reschedule','2027-03-14');
    let row=(await db.query("select (due_at at time zone 'America/Toronto')::text local,edit_version from reminders where id=$1",[id(20)])).rows[0];
    assert.match(row.local,/2027-03-14 12:00:00/);assert.equal(String(row.edit_version),'2');
    await update(db,31,2,'reschedule','2027-11-07');
    await db.exec('reset role');await db.query("update reminders set status='done',edit_version=99 where id=$1",[id(20)]);
    row=(await db.query('select edit_version from reminders where id=$1',[id(20)])).rows[0];assert.equal(String(row.edit_version),'4');
    await as(db,1);await assert.rejects(()=>update(db,32,3,'cancel'),e=>e.code==='40001');
    await assert.rejects(()=>update(db,32,4,'reschedule','2027-12-01'),e=>e.code==='22023');
    await assert.rejects(()=>update(db,32,4,'reopen','2027-12-01'),e=>e.code==='22023');
  }finally{await db.close();}
});
test('OS operations SQL: complete customer order history and task pagination exclude soft-deleted records',async()=>{
  const db=await createDatabase();try{
    await fixture(db);
    for(let i=0;i<23;i++){
      await db.query("insert into bookings(id,client_id,starts_at,status,deleted_at) values($1,$2,'2027-07-12T14:00:00Z','confirmed',case when $3 then now() else null end)",[id(100+i),id(10),i===22]);
      await db.query("insert into reminders(id,reason,due_at) values($1,'QA extra task','2027-07-12T14:00:00Z')",[id(200+i)]);
    }
    await as(db,1);const d=await detail(db);assert.equal(d.total,22);assert.equal(d.bookings.length,20);
    const next=(await db.query('select sculpy_os_client_detail($1,20) as d',[id(10)])).rows[0].d;assert.equal(next.bookings.length,2);
    assert.equal(new Set([...d.bookings,...next.bookings].map(x=>x.id)).size,22);
    await assert.rejects(()=>db.query('select sculpy_os_client_detail($1,0)',[id(11)]),e=>e.code==='22023');
    for(const q of ['QA customer','qa@EXAMPLE.test','555-0100'])assert.equal((await db.query('select sculpy_os_clients($1,0) as d',[q])).rows[0].d.total,1);
    assert.equal((await list(db)).tasks.length,20);assert.equal((await list(db)).total,24);
    assert.equal((await db.query("select sculpy_os_tasks('open',20) as d")).rows[0].d.tasks.length,4);
    await assert.rejects(()=>db.query("select sculpy_os_tasks('open',-1)"),e=>e.code==='22023');
  }finally{await db.close();}
});
test('OS operations SQL: two administrators cannot overwrite the same task revision',{skip:!process.env.SCULPY_TEST_DATABASE_URL},async()=>{
  const db=await createDatabase();let a,b;try{
    await fixture(db);a=await db.connect();b=await db.connect();await as(a,1);await as(b,2);
    const results=await Promise.allSettled([update(a,30,1,'complete'),update(b,31,1,'cancel')]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(results.find(x=>x.status==='rejected').reason.code,'40001');
  }finally{await a?.end();await b?.end();await db.close();}
});
