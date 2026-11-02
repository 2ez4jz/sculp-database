import test from 'node:test';import assert from 'node:assert/strict';import webpush from 'web-push';
import {createDatabase} from './support/cloud-database.mjs';
const id=n=>`35000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const role=async(db,r)=>db.exec('reset role;set role '+r);
const api=async(db,n,action,data={})=>{await role(db,'service_role');return (await db.query('select sculpy_push_api($1,$2,$3,$4) d',[action,id(n),id(n+100),data])).rows[0].d;};
const server=async(db,action,data={})=>{await role(db,'service_role');return (await db.query('select sculpy_push_server($1,$2) d',[action,data])).rows[0].d;};
async function fixture(db){
 await db.exec("set time zone 'America/Toronto'");
 await db.exec(`create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),decrypted_secret text,name text);
 create view vault.decrypted_secrets as select * from vault.secrets;
 create function vault.create_secret(secret text,name text,description text default '') returns uuid language plpgsql as $$declare x uuid;begin insert into vault.secrets(decrypted_secret,name) values(secret,name) returning id into x;return x;end$$;`);
 const worker=(await db.query("select vault.create_secret($1,'fictional-worker','fixture') id",['a'.repeat(64)])).rows[0].id;
 await db.query('update sculpy_private.push_config set worker_secret_id=$1 where id',[worker]);
 for(const [n,r] of [[1,'operations'],[2,'owner'],[3,'artist'],[4,'read_only']]){
  await db.query('insert into auth.users(id) values($1)',[id(n)]);
  await db.query('insert into profiles(id,display_name,role) values($1,$2,$3)',[id(n),`Fictional Push User ${n}`,r]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(n+100),id(n)]);
 }
 const keys=webpush.generateVAPIDKeys();await server(db,'identity',keys);
 await api(db,1,'global',{enabled:true,overdueHours:24,repeatHours:0});
 for(const n of [1,2,3]){
  await api(db,n,'state');await api(db,n,'subscribe',{subscription:{endpoint:`https://fcm.googleapis.com/fcm/send/FICTIONAL-${n}`,keys:{p256dh:'B'.repeat(87),auth:'C'.repeat(22)}},label:'Fictional browser'});
 }
 return keys;
}
async function lead(db,n){
 await role(db,'service_role');
 const payload={submission_id:id(n),name:'Fictional Private Client',email:`push${n}@example.test`,service:'Bridal',location:'Fictional private address',event_date:'2027-08-01',party_size:1,details:'Fictional private customer notes'};
 await db.query('select sculpy_submit_website_enquiry($1,$2)',[payload,'a'.repeat(64)]);
 await role(db,'postgres');const row=(await db.query('select id from website_enquiries where submission_id=$1',[id(n)])).rows[0];return {payload,id:row.id};
}
test('push queue: private APIs, explicit opt-in, website dedupe, generic payloads, retry leases, reminders and session/role revocation',async()=>{
 const db=await createDatabase();try{
  const keys=await fixture(db);
  assert(!(await server(db,'authorize_worker',{key:'b'.repeat(64)})).authorized);assert((await server(db,'authorize_worker',{key:'a'.repeat(64)})).authorized);
  await role(db,'authenticated');
  await assert.rejects(()=>db.query("select sculpy_push_api('state',$1,$2,'{}')",[id(1),id(101)]),e=>e.code==='42501');
  await assert.rejects(()=>db.query('select * from sculpy_private.push_devices'),e=>e.code==='42501');
  await role(db,'anon');await assert.rejects(()=>db.query("select sculpy_push_server('claim','{}')"),e=>e.code==='42501');
  const state=await api(db,1,'state');assert(state.preferences.enabled);assert.equal(state.publicKey,keys.publicKey);
  assert(!JSON.stringify(state).includes(keys.privateKey));assert(!JSON.stringify(state).includes('endpoint'));assert(!('quiet_start' in state.preferences));
  await assert.rejects(()=>api(db,2,'global',{enabled:true,overdueHours:1,repeatHours:0}),e=>e.code==='42501');
  const enquiry=await lead(db,201);
  await role(db,'service_role');await db.query('select sculpy_submit_website_enquiry($1,$2)',[enquiry.payload,'a'.repeat(64)]);
  await role(db,'postgres');
  assert.equal((await db.query("select count(*)::int n from sculpy_private.push_notifications where kind='new_enquiry'")).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from sculpy_private.push_notifications where recipient_id=$1',[id(3)])).rows[0].n,0);
  let batch=await server(db,'claim');assert.equal(batch.items.length,2);
  const prepared=await server(db,'prepare',batch.items[0]);assert.equal(prepared.notification.title,'收到新的婚礼询盘');
  assert.deepEqual(Object.keys(prepared.notification).sort(),['body','id','kind','title']);assert(!JSON.stringify(prepared.notification).includes('Private'));
  await server(db,'finish',{...batch.items[0],result:'accepted',code:'http_201'});
  const old=batch.items[1];await server(db,'finish',{...old,result:'retry',code:'http_503',retryAfter:60});
  await role(db,'postgres');await db.query("update sculpy_private.push_deliveries set next_attempt_at=now()-interval '1 second' where id=$1",[old.id]);
  batch=await server(db,'claim');assert.equal(batch.items.length,1);assert.notEqual(batch.items[0].lease,old.lease);
  assert((await server(db,'finish',{...old,result:'accepted',code:'http_201'})).ignored);
  await server(db,'finish',{...batch.items[0],result:'accepted',code:'http_201'});
  await role(db,'postgres');await db.query("update website_enquiries set first_contact_at=now()-interval '23 hours',handled_by=$2 where id=$1",[enquiry.id,id(2)]);
  await server(db,'tick');await role(db,'postgres');assert.equal((await db.query("select count(*)::int n from sculpy_private.push_notifications where kind='overdue'")).rows[0].n,0);
  await db.query("update website_enquiries set first_contact_at=now()-interval '25 hours' where id=$1",[enquiry.id]);
  await server(db,'tick');await server(db,'tick');await role(db,'postgres');
  const reminders=(await db.query("select * from sculpy_private.push_notifications where kind='overdue'")).rows;assert.equal(reminders.length,1);assert.equal(reminders[0].recipient_id,id(2));
  await db.query("update website_enquiries set status='contacted' where id=$1",[enquiry.id]);assert.equal((await server(db,'claim')).items.length,0);
  const history=await api(db,2,'history');assert.equal(history.items.length,2,'processed notifications remain in history');
  assert.equal((await api(db,2,'open',{id:reminders[0].id})).id,enquiry.id);await assert.rejects(()=>api(db,3,'open',{id:reminders[0].id}),e=>e.code==='42501');
  await role(db,'postgres');await db.query('delete from auth.sessions where id=$1',[id(102)]);
  await assert.rejects(()=>api(db,2,'state'),e=>e.code==='42501');
  const second=await lead(db,202);batch=await server(db,'claim');assert.equal(batch.items.length,1,'signed-out owner receives no new work push');
  await role(db,'postgres');await db.query("update profiles set role='artist' where id=$1",[id(1)]);
  assert.deepEqual(await server(db,'prepare',batch.items[0]),{});assert.equal((await api(db,1,'history')).items.length,0,'demoted user cannot view old business notices');
  assert(second.id);
 }finally{await db.close();}
});

test('push settings: failed enqueue cannot block website intake; preferences, endpoint reassignment and expiry are checked',async()=>{
 const db=await createDatabase();try{
  await fixture(db);
  const oldDevice=(await api(db,2,'state')).devices[0];await role(db,'postgres');
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(152),id(2)]);
  await role(db,'service_role');await db.query("select sculpy_push_api('logout',$1,$2,$3)",[id(2),id(152),{deviceId:oldDevice.id}]);
  assert(!(await api(db,2,'state')).devices[0].active,'logout also revokes this device if it was bound to an older login');
  await api(db,2,'subscribe',{subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/FICTIONAL-2',keys:{p256dh:'B'.repeat(87),auth:'C'.repeat(22)}}});
  await api(db,1,'preferences',{enabled:false,new_enquiry:true,overdue:true});
  await role(db,'postgres');assert.equal((await db.query('select count(*)::int n from sculpy_private.push_devices where user_id=$1 and active',[id(1)])).rows[0].n,0);
  await assert.rejects(()=>api(db,3,'subscribe',{subscription:{endpoint:'http://127.0.0.1/private',keys:{p256dh:'B'.repeat(87),auth:'C'.repeat(22)}}}),e=>e.code==='22023');
  await role(db,'postgres');await db.exec(`create function sculpy_private.break_push_insert() returns trigger language plpgsql as $$begin raise exception 'fixture queue failure';end$$;
   create trigger break_push_insert before insert on sculpy_private.push_notifications for each row execute function sculpy_private.break_push_insert();`);
  const enq=await lead(db,203);assert(enq.id);await role(db,'postgres');
  assert.equal((await db.query("select count(*)::int n from sculpy_private.push_errors where source='website-trigger'")).rows[0].n,1);
  await db.exec('drop trigger break_push_insert on sculpy_private.push_notifications');
  const device=(await api(db,2,'state')).devices[0];await api(db,2,'test',{deviceId:device.id});
  await assert.rejects(()=>api(db,2,'test',{deviceId:device.id}),e=>e.code==='P0429');
  const claim=await server(db,'claim');assert.equal(claim.items.length,1);
  await server(db,'finish',{...claim.items[0],result:'gone',code:'http_410'});
  assert(!(await api(db,2,'state')).devices[0].active);
  await role(db,'postgres');await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[id(103)]);
  await assert.rejects(()=>api(db,3,'state'),e=>e.code==='42501');
 }finally{await db.close();}
});

test('two PostgreSQL workers cannot claim the same push delivery',{skip:!process.env.SCULPY_TEST_DATABASE_URL},async()=>{
 const db=await createDatabase();let a,b;try{
  await fixture(db);await lead(db,204);
  a=await db.connect();b=await db.connect();await a.exec('set role service_role');await b.exec('set role service_role');
  const results=await Promise.all([a,b].map(c=>c.query("select sculpy_push_server('claim','{}') d")));
  const ids=results.flatMap(r=>r.rows[0].d.items.map(x=>x.id));assert.equal(ids.length,2);assert.equal(new Set(ids).size,2);
 }finally{await a?.end();await b?.end();await db.close();}
});
