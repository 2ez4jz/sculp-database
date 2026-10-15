import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from './support/cloud-database.mjs';
const client='80000000-0000-0000-0000-000000000001';
const latest=async()=> (await readdir('supabase/migrations')).find(n=>n.endsWith('_lucky_order_numbers.sql'));

test('migration backfills existing rows once, preserves UUID and rejects number edits',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema sculpy_private;
   create table public.services(id uuid primary key,code text);
   create table public.bookings(id uuid primary key,service_id uuid,created_at timestamptz default now());
   insert into services values('${client}','wedding');
   insert into bookings(id,service_id) select gen_random_uuid(),'${client}' from generate_series(1,50);`);
  const before=(await db.query('select id from bookings order by id')).rows;
  await db.exec(await readFile('supabase/migrations/'+await latest(),'utf8'));
  assert.deepEqual((await db.query('select id from bookings order by id')).rows,before);
  const rows=(await db.query('select id,order_number from bookings')).rows;
  assert.equal(new Set(rows.map(b=>b.order_number)).size,50);assert(rows.every(b=>/^61[012356789]{4}$/.test(b.order_number)));
  await assert.rejects(()=>db.query("update bookings set order_number='610000' where id=$1",[rows[0].id]),/不能修改/);
  await assert.rejects(()=>db.query("insert into bookings(id,order_number) values(gen_random_uuid(),'644444')"),/系统自动生成/);
  assert.equal((await db.query('select order_number from bookings where id=$1',[rows[0].id])).rows[0].order_number,rows[0].order_number);
 }finally{await db.close();}
});
test('cloud projection searches references and retains role boundaries; concurrent inserts remain unique',async t=>{
 const db=await createDatabase();
 const owner='90000000-0000-0000-0000-000000000001',staff='90000000-0000-0000-0000-000000000002';
 try {
  await db.exec(`insert into auth.users(id) values('${owner}'),('${staff}');
   insert into profiles(id,display_name,role) values('${owner}','QA Owner','owner'),('${staff}','QA Staff','artist');
   insert into clients(id,display_name) values('${client}','Synthetic reference test');
   insert into bookings(client_id,service_id,starts_at)
   select '${client}',s.id,now() from services s cross join generate_series(1,12);`);
  const rows=(await db.query('select b.id,b.order_number,s.code from bookings b join services s on s.id=b.service_id')).rows;
  const codes={wedding:'1',trial:'2',event:'3',photoshoot:'5',commercial:'6',education:'7',personal:'8'};
  assert(rows.every(b=>b.order_number[1]===codes[b.code]&&!b.order_number.includes('4')));
  const number=rows[0].order_number;
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
  const context=(await db.query("select sculpy_context(null,$1,0) as data",[number])).rows[0].data;
  assert.equal(context.total,1);assert.equal(context.bookings[0].order_number,number);
  await db.exec(`set request.jwt.claim.sub='${staff}'`);
  assert.equal((await db.query('select sculpy_context(null,$1,0) as data',[number])).rows[0].data.total,0);
  await assert.rejects(()=>db.query('select sculpy_private.assign_order_number()'),/permission denied/);
  await db.exec('reset role');
  if(!db.connect){t.diagnostic('Concurrent allocation is verified in the PostgreSQL CI job.');return;}
  const second=await db.connect();
  try {
   const insert=connection=>connection.query(`insert into bookings(client_id,service_id,starts_at) select '${client}',id,now() from services where code='wedding' returning order_number`);
   const inserted=[];
   for(let i=0;i<12;i++){
    // Force both sessions to propose the same random suffix, rather than
    // hoping a low-probability collision happens during the test.
    await Promise.all([db.query('select setseed($1)',[i/20]),second.query('select setseed($1)',[i/20])]);
    inserted.push(...await Promise.all([insert(db),insert(second)]));
   }
   assert.equal(new Set(inserted.map(r=>r.rows[0].order_number)).size,24);
  }finally{await second.end();}
 }finally{await db.close();}
});
