import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const owner='00000000-0000-0000-0000-000000000001',staff='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003',artist='10000000-0000-0000-0000-000000000001',service='20000000-0000-0000-0000-000000000001';
test('cloud intake: atomic create, source fidelity, replay, duplicates, dates, RLS, cross-session read',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role service_role;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;`);
 for(const name of ['001_initial_schema.sql','002_production_core.sql','003_context_memory.sql','20261007222258_sculpy_conversations.sql',...(await readdir('supabase/migrations')).filter(x=>x.endsWith('_cloud_intake.sql')||x.endsWith('_intake_source_boundary.sql'))])await db.exec((await readFile('supabase/migrations/'+name,'utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(`insert into auth.users values('${owner}'),('${staff}'),('${other}');insert into profiles(id,display_name,role) values('${owner}','QA Operations','operations'),('${staff}','QA Artist','artist'),('${other}','QA Other','artist');insert into artists(id,slug,profile_id,name,level,employment_status) values('${artist}','qa','${staff}','QA Artist','Senior','active');insert into services(id,code,name) values('${service}','qa_wedding','Wedding');set role authenticated;set request.jwt.claim.sub='${owner}';`);
 const raw='  我是Amy，2026年11月15日结婚，早上7点，新娘妆和妈妈妆，Markham，预算1800。\n';
 const payload={clientName:'QA Amy',clientId:'',city:'Markham',date:'2026-11-15',time:'07:00',serviceId:service,artistId:artist,location:'Markham',details:'新娘妆和妈妈妆',budget:'1800'};
 const recorded='2026-10-08T15:00:00Z',key=crypto.randomUUID();
 const save=(p=payload,k=crypto.randomUUID())=>db.query('select sculpy_confirm_intake($1,$2,$3,$4) as data',[k,p,raw,recorded]).then(r=>r.rows[0].data);
 const result=await save(payload,key);assert(result.bookingId);assert.equal(result.replayed,false);
 const retry=await save(payload,key);assert.equal(retry.bookingId,result.bookingId);assert.equal(retry.replayed,true);
 await assert.rejects(()=>save({...payload,budget:'1900'},key),/请求已使用/);
 await assert.rejects(()=>save(payload),/同名/);
 await assert.rejects(()=>save({...payload,clientId:result.clientId}),/重复/);
 const context=async()=> (await db.query('select sculpy_order_detail($1) as data',[result.bookingId])).rows[0].data;
 let data=await context();assert.equal(data.intake.rawText,raw);assert.equal(data.bookings[0].budget_cad,1800);assert(!('price_cad' in data.bookings[0]));assert.equal(new Date(data.bookings[0].starts_at).toISOString(),'2026-11-15T12:00:00.000Z');assert.equal(data.bookings[0].venue,'Markham');
 const aiContext=(await db.query('select sculpy_context($1) as data',[result.bookingId])).rows[0].data;assert(!aiContext.intake);assert(!('service_details' in aiContext.bookings[0]));assert(!('budget_cad' in aiContext.bookings[0]));
 const lookup=(await db.query("select sculpy_intake_lookup(' QA AMY ') as data")).rows[0].data;assert.equal(lookup.clients.length,1);
 for(const override of [{date:'2026-02-30'},{time:'25:00'},{date:'2026-03-08',time:'02:30'},{date:'2026-11-01',time:'01:30'},{budget:'-1'},{budget:'1.999'},{serviceId:''},{artistId:other},{clientName:'X'}])await assert.rejects(()=>save({...payload,clientName:'QA Invalid',...override}));
 await assert.rejects(()=>save({...payload,clientName:'QA Invalid',price_cad:'1800'}));
 await assert.rejects(()=>db.query("insert into booking_intakes(request_id) values(gen_random_uuid())"));
 await db.exec(`reset role;`);assert.equal((await db.query('select count(*)::int as n from clients')).rows[0].n,1);assert.equal((await db.query('select count(*)::int as n from bookings')).rows[0].n,1);
 // Force a late failure after client and booking inserts: everything must roll back.
 await db.exec(`create function fail_intake_test() returns trigger language plpgsql as $$begin raise exception 'simulated late failure';end$$;create trigger fail_intake before insert on booking_intakes for each row execute function fail_intake_test();set role authenticated;set request.jwt.claim.sub='${owner}'`);
 await assert.rejects(()=>save({...payload,clientName:'QA Rollback'}),/late failure/);
 await db.exec('reset role;drop trigger fail_intake on booking_intakes;');assert.equal((await db.query('select count(*)::int as n from clients')).rows[0].n,1);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${staff}'`);
 data=await context();assert.equal(data.bookings.length,1);assert(!('budget_cad' in data.bookings[0]));assert(!data.intake);assert.equal((await db.query('select * from booking_intakes')).rows.length,0);
 await assert.rejects(()=>save(),/管理员/);await assert.rejects(()=>db.query("select sculpy_intake_lookup('QA Amy')"),/管理员/);
 await db.exec(`set request.jwt.claim.sub='${other}'`);await assert.rejects(()=>context(),/unavailable/);
 await db.exec(`reset role;update profiles set active=false where id='${owner}';set role authenticated;set request.jwt.claim.sub='${owner}'`);await assert.rejects(()=>save(),/管理员/);
 await db.exec('reset role;set role anon;');await assert.rejects(()=>save());await assert.rejects(()=>context());
 }finally{await db.close()}
});
