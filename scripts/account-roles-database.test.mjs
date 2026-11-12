import test from 'node:test';import assert from 'node:assert/strict';
import {createDatabase} from './support/cloud-database.mjs';
const id=n=>`25000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const as=async(db,n,role='authenticated')=>{await db.exec('reset role;set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);};
test('production account roles: owner has business edit access; only operations manages accounts; retired role cannot be assigned',async()=>{
 const db=await createDatabase();try{
  for(const [n,role,active] of [[1,'operations',true],[2,'owner',true],[3,'artist',true],[4,'read_only',true],[5,'operations',false]]){
   await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),`sculp_role${n}@accounts.sculp.invalid`]);
   await db.query('insert into profiles(id,username,display_name,role,active) values($1,$2,$3,$4,$5)',[id(n),`sculp_role${n}`,`Fictional role ${n}`,role,active]);
  }
  await as(db,1);assert.equal((await db.query('select is_business_admin() b,is_system_admin() s')).rows[0].s,true);
  assert.equal((await db.query('select * from list_managed_accounts()')).rows.length,5);
  await assert.rejects(()=>db.query('select update_managed_account($1,$2,$3,$4)',[id(2),'Fictional owner','admin',true]),e=>e.code==='23514');
  await db.query('select update_managed_account($1,$2,$3,$4)',[id(2),'Fictional owner','owner',true]);
  await as(db,2);assert.deepEqual((await db.query('select is_business_admin() b,is_staff_manager() m,is_system_admin() s')).rows[0],{b:true,m:true,s:false});
  const lead=(await db.query("select sculpy_wedding_command($1,'save_lead',$2) d",[crypto.randomUUID(),{confirmed:true,reason:'Fictional owner edit test',name:'Fictional client',contact:'fixture only',service:'Wedding',source:'unknown',status:'pending'}])).rows[0].d;
  assert(lead.leadId);
  for(const n of [2,3,4,5]){await as(db,n);await assert.rejects(()=>db.query('select * from list_managed_accounts()'),e=>e.code==='42501');await assert.rejects(()=>db.query('select update_managed_account($1,$2,$3,$4)',[id(3),'Fixture','owner',true]),e=>e.code==='42501');}
  await db.exec('reset role');
  await db.query('insert into auth.users(id,email) values($1,$2)',[id(6),'sculp_role6@accounts.sculp.invalid']);
  await assert.rejects(()=>db.query("insert into profiles(id,display_name,role) values($1,'Retired role fixture','admin')",[id(6)]),e=>e.code==='23514');
  await as(db,1,'service_role');
  await assert.rejects(()=>db.query('select provision_managed_account($1,$2,$3,$4,$5)',[id(1),id(6),'sculp_role6','Retired role fixture','admin']),e=>e.code==='23514');
  await db.query('select provision_managed_account($1,$2,$3,$4,$5)',[id(1),id(6),'sculp_role6','New owner fixture','owner']);
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from profiles where role='admin'")).rows[0].n,0);
  assert.equal((await db.query('select role::text from profiles where id=$1',[id(2)])).rows[0].role,'owner');
 }finally{await db.close();}
});

test('cloud welcome editing: operations-only, audited, replay-safe, versioned and readable through existing profile RLS',async()=>{
 const db=await createDatabase();try{
  for(const [n,role,active] of [[11,'operations',true],[12,'owner',true],[13,'artist',true],[14,'read_only',true],[15,'operations',false]]){
   await db.query('insert into auth.users(id) values($1)',[id(n)]);
   await db.query('insert into profiles(id,display_name,role,active) values($1,$2,$3,$4)',[id(n),`Fictional welcome ${n}`,role,active]);
  }
  await as(db,11);assert.equal((await db.query('select * from list_account_welcomes()')).rows.length,5);
  const save=async(message,revision)=>db.query('select set_account_welcome($1,$2,$3) value',[id(12),message,revision]);
  const saved=(await save('  欢迎 Miranda  ',0)).rows[0].value;
  assert.equal(saved.welcome_message,'欢迎 Miranda');assert.equal(saved.welcome_revision,1);
  assert.deepEqual((await save('欢迎 Miranda',0)).rows[0].value,saved,'lost acknowledgment retry is a no-op');
  await assert.rejects(()=>save('Stale draft',0),e=>e.code==='40001');
  await assert.rejects(()=>save('x'.repeat(161),1),e=>e.code==='22023');
  await assert.rejects(()=>save(null,1),e=>e.code==='22023');
  await assert.rejects(()=>save('Welcome',null),e=>e.code==='22023');
  await assert.rejects(()=>db.query('select set_account_welcome($1,$2,$3)',[id(99),'Missing',0]),e=>e.code==='P0002');
  for(const n of [12,13,14,15]){
   await as(db,n);
   await assert.rejects(()=>db.query('select * from list_account_welcomes()'),e=>e.code==='42501');
   await assert.rejects(()=>save('Unauthorized',1),e=>e.code==='42501');
   await assert.rejects(()=>db.query('update profiles set welcome_message=$1 where id=$2',['Bypass',id(12)]),e=>e.code==='42501');
  }
  await as(db,0,'anon');await assert.rejects(()=>save('Anonymous',1),e=>e.code==='42501');
  await as(db,12);assert.equal((await db.query('select welcome_message from profiles where id=$1',[id(12)])).rows[0].welcome_message,'欢迎 Miranda');
  await as(db,13);assert.equal((await db.query('select id from profiles')).rows.length,1,'employee profile reads remain scoped');
  await as(db,11);assert.equal((await save('',1)).rows[0].value.welcome_message,'');
  await db.exec('reset role');
  const audit=(await db.query("select actor_id,before_value,after_value from audit_events where action='welcome_update' order by created_at,id")).rows;
  assert.equal(audit.length,2);assert(audit.every(x=>x.actor_id===id(11)));
  assert.equal(BigInt((await db.query('select welcome_revision from profiles where id=$1',[id(12)])).rows[0].welcome_revision),2n);
 }finally{await db.close();}
});
