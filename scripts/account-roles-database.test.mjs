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
