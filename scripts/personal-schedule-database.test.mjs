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
  assert.equal(inserted.version,1);assert.equal(inserted.updated_by,uid(1));
  await actor(db,2);
  assert.equal((await db.query('select title from public.miranda_schedule')).rows[0].title,'QA flight');
  const changed=await db.query('update public.miranda_schedule set completed=true,updated_by=$2 where id=$1 and version=1 returning *',[uid(10),uid(1)]);
  assert.equal(changed.rows[0].completed,true);assert.equal(changed.rows[0].updated_by,uid(2));
  assert.equal(changed.rows[0].version,2);
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
