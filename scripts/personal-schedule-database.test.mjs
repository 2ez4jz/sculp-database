import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './support/cloud-database.mjs';
const uid=n=>`59000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function actor(db,n,role='authenticated'){
 await db.exec('reset role;set role '+role);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);
}
test('personal agenda: shared CRUD, private access, active accounts, local dates and optimistic conflicts',async()=>{
 const db=await createDatabase();try{
  for(const [n,role,username,active] of [[1,'operations','sculp_jz',true],[2,'owner','sculp_miranda',true],[3,'artist','sculp_qaartist',true],[4,'operations','sculp_qaother',true],[5,'owner','sculp_qainactive',false]]){
   await db.query('insert into auth.users(id) values($1)',[uid(n)]);
   await db.query('insert into public.profiles(id,display_name,role,username,active) values($1,$2::text,$2::public.app_role,$3,$4)',[uid(n),role,username,active]);
  }
  await actor(db,1);
  const inserted=(await db.query(`insert into public.miranda_schedule(id,title,category,starts_local,ends_local,start_timezone,end_timezone)
   values($1,'QA flight','flight','2026-11-23 10:00','2026-11-24 15:00','America/Vancouver','Asia/Shanghai') returning *`,[uid(10)])).rows[0];
  assert.equal(Number(inserted.version),1);assert.equal(inserted.updated_by,uid(1));
  await actor(db,2);
  assert.equal((await db.query('select title from public.miranda_schedule')).rows[0].title,'QA flight');
  const changed=await db.query('update public.miranda_schedule set completed=true,updated_by=$2 where id=$1 and version=1 returning *',[uid(10),uid(1)]);
  assert.equal(changed.rows[0].completed,true);assert.equal(changed.rows[0].updated_by,uid(2));
  assert.equal(Number(changed.rows[0].version),2);
  await actor(db,1);
  assert.equal((await db.query('update public.miranda_schedule set title=$2 where id=$1 and version=1 returning id',[uid(10),'stale'])).rows.length,0);
  // Westbound date-line crossing: arrival's local date can precede departure's.
  await db.query(`insert into public.miranda_schedule(title,category,starts_local,ends_local,start_timezone,end_timezone)
   values('Date line','flight','2026-11-24 01:00','2026-11-23 20:00','Asia/Shanghai','America/Vancouver')`);
  await assert.rejects(()=>db.query(`insert into public.miranda_schedule(title,category,starts_local,ends_local) values('Invalid','work','2026-11-24 15:00','2026-11-24 14:00')`));
  await assert.rejects(()=>db.query(`insert into public.miranda_schedule(title,category,starts_local,start_timezone) values('Invalid','work','2026-11-24 15:00','Not/AZone')`));
  await assert.rejects(()=>db.query(`insert into public.miranda_schedule(title,category,starts_local) values('DST gap','work','2026-03-08 02:30')`));
  for(const n of [3,4,5]){
   await actor(db,n);assert.equal((await db.query('select count(*)::int n from public.miranda_schedule')).rows[0].n,0);
   await assert.rejects(()=>db.query(`insert into public.miranda_schedule(title,category,starts_local) values('forbidden','todo','2026-11-24')`));
   assert.equal((await db.query('delete from public.miranda_schedule returning id')).rows.length,0);
   assert.equal((await db.query("update public.miranda_schedule set title='forbidden' returning id")).rows.length,0);
  }
  await actor(db,0,'anon');await assert.rejects(()=>db.query('select * from public.miranda_schedule'));
  await actor(db,1);assert.equal((await db.query('delete from public.miranda_schedule where id=$1 and version=2 returning id',[uid(10)])).rows.length,1);
  await db.exec('reset role');await db.query('update public.profiles set active=false where id=$1',[uid(2)]);
  await actor(db,2);assert.equal((await db.query('select count(*)::int n from public.miranda_schedule')).rows[0].n,0);
 }finally{await db.close();}
});

test('personal agenda work tasks: Toronto date boundaries, Miranda assignment, and existing task completion',async()=>{
 const db=await createDatabase();
 try{
  for(const [n,role,username] of [[1,'operations','sculp_jz'],[2,'owner','sculp_miranda'],[3,'artist','sculp_qaartist'],[4,'operations','sculp_qaother']]){
   await db.query('insert into auth.users(id) values($1)',[uid(n)]);
   await db.query('insert into public.profiles(id,display_name,role,username) values($1,$2::text,$2::public.app_role,$3)',[uid(n),role,username]);
  }
  await db.query(`insert into public.reminders(id,assigned_to,due_at,status,reason) values
   ($1,$2,'2026-03-08T04:59:59Z','open','Previous day'),
   ($3,$2,'2026-03-08T05:00:00Z','open','Day start'),
   ($4,$2,'2026-03-09T03:59:59Z','done','Day end'),
   ($5,$2,'2026-03-09T04:00:00Z','open','Next day'),
   ($6,$2,'2026-03-08T15:00:00Z','dismissed','Cancelled task'),
   ($7,$8,'2026-03-08T15:00:00Z','open','JZ task')`,[uid(10),uid(2),uid(11),uid(12),uid(13),uid(14),uid(15),uid(1)]);
  const read=()=>db.query("select id,status,edit_version from public.sculpy_miranda_daily_work_tasks('2026-03-08','2026-03-09') order by id");
  await actor(db,1);
  const initial=(await read()).rows;
  assert.deepEqual(initial.map(r=>r.id),[uid(11),uid(12)]);
  assert.deepEqual(initial.map(r=>r.status),['open','done']);
  await db.query("select public.sculpy_os_update_task($1,$2,$3,'complete',null,true)",[uid(20),uid(11),initial[0].edit_version]);
  await actor(db,2);
  assert.deepEqual((await read()).rows.map(r=>r.status),['done','done']);
  await actor(db,3);await assert.rejects(read,error=>error.code==='42501');
  await actor(db,4);await assert.rejects(read,error=>error.code==='42501');
  await actor(db,0,'anon');await assert.rejects(read,error=>error.code==='42501');
  await actor(db,1);
  await assert.rejects(()=>db.query("select * from public.sculpy_miranda_daily_work_tasks('2026-03-08','2026-05-01')"),error=>error.code==='22023');
 }finally{await db.close();}
});

test('shared daily work includes JZ and Miranda overdue tasks and enforces the two-account boundary',async()=>{
 const db=await createDatabase();
 try{
  for(const [n,role,username] of [[1,'operations','sculp_jz'],[2,'owner','sculp_miranda'],[3,'artist','sculp_qastaff'],[4,'operations','sculp_other']]){
   await db.query('insert into auth.users(id) values($1)',[uid(n)]);
   await db.query('insert into public.profiles(id,display_name,role,username) values($1,$2::text,$2::public.app_role,$3)',[uid(n),role,username]);
  }
  await db.query(`insert into public.reminders(id,assigned_to,due_at,status,reason) values
   ($1,$2,'2026-03-07T15:00:00Z','open','JZ overdue'),
   ($3,$4,'2026-03-08T15:00:00Z','open','Miranda today'),
   ($5,$4,'2026-03-09T15:00:00Z','open','Future'),
   ($6,$7,'2026-03-08T15:00:00Z','open','Other account')`,[uid(10),uid(1),uid(11),uid(2),uid(12),uid(13),uid(4)]);
  const read=()=>db.query("select * from public.sculpy_shared_daily_work_tasks('2026-03-08') order by id");
  await actor(db,1);const rows=(await read()).rows;
  assert.deepEqual(rows.map(r=>r.id),[uid(10),uid(11)]);
  await db.query("select public.sculpy_os_update_task($1,$2,$3,'complete',null,true)",[uid(20),uid(11),rows[1].edit_version]);
  await actor(db,2);assert.deepEqual((await read()).rows.map(r=>r.status),['open','done']);
  assert.deepEqual((await db.query("select id from public.sculpy_shared_daily_work_tasks('2026-03-09') order by id")).rows.map(r=>r.id),[uid(10),uid(12)]);
  for(const n of [3,4]){await actor(db,n);await assert.rejects(read,error=>error.code==='42501');}
  await actor(db,0,'anon');await assert.rejects(read,error=>error.code==='42501');
 }finally{await db.close();}
});

test('day comments protect authors, date, reciprocal mentions and recipient-only acknowledgements',async()=>{
 const db=await createDatabase();
 try{
  for(const [n,role,name] of [[1,'operations','sculp_jz'],[2,'owner','sculp_miranda'],[3,'owner','sculp_other']]){
   await db.query('insert into auth.users(id) values($1)',[uid(n)]);
   await db.query('insert into public.profiles(id,display_name,role,username) values($1,$3,$2::public.app_role,$3)',[uid(n),role,name]);
  }
  const post=(id,body)=>db.query("insert into public.miranda_day_comments(id,agenda_day,body) values($1,'2026-11-24',$2) returning *",[uid(id),body]);
  await actor(db,1);
  const first=(await post(10,'明早 @Miranda 确认')).rows[0];
  assert.equal(first.author_id,uid(1));assert.equal(first.mentioned_user_id,uid(2));
  assert.equal((await post(11,'mail@example.com and someone@Miranda.com')).rows[0].mentioned_user_id,null);
  assert.equal((await db.query('update public.miranda_day_comments set read_at=now() returning id')).rows.length,0);
  await assert.rejects(()=>post(10,'repeat'),e=>e.code==='23505');
  await assert.rejects(()=>db.query("insert into public.miranda_day_comments(id,agenda_day,body,author_id) values($1,current_date,'x',$2)",[uid(20),uid(2)]),e=>e.code==='42501');
  await actor(db,2);
  assert.equal((await db.query("select count(*)::int n from public.miranda_day_comments where agenda_day='2026-11-25'")).rows[0].n,0);
  assert.equal((await db.query('update public.miranda_day_comments set read_at=now() where id=$1 returning id',[uid(10)])).rows.length,1);
  assert.equal((await post(12,'收到＠Jz。')).rows[0].mentioned_user_id,uid(1));
  await assert.rejects(()=>db.query("update public.miranda_day_comments set body='other'"),e=>e.code==='42501');
  await actor(db,3);assert.equal((await db.query('select * from public.miranda_day_comments')).rows.length,0);
  await assert.rejects(()=>post(13,'outside'),e=>e.code==='42501');
  await actor(db,0,'anon');await assert.rejects(()=>db.query('select * from public.miranda_day_comments'),e=>e.code==='42501');
 }finally{await db.close();}
});
