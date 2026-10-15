import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const owner='00000000-0000-0000-0000-000000000001',staff='00000000-0000-0000-0000-000000000002';
test('V2.2 memory persists across conversations; approval/correction/revocation, audit and role boundaries',async()=>{
const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const f of ['001_initial_schema.sql','002_production_core.sql','003_context_memory.sql','20261007222258_sculpy_conversations.sql','20261015000159_sculpy_operating_memory.sql'])await db.exec((await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(`insert into auth.users values('${owner}'),('${staff}');insert into public.profiles(id,display_name,role) values('${owner}','Test admin','operations'),('${staff}','Test artist','artist');set role authenticated;set request.jwt.claim.sub='${owner}';`);
 const manage=async(action,id,revision=null,content=null,supersedes=null)=>(await db.query('select public.sculpy_manage_memory($1,$2,$3,$4,$5) x',[action,id,revision,content,supersedes])).rows[0].x;
 const search=async()=> (await db.query("select public.sculpy_search_memory('定金') x")).rows[0].x;
 const id=crypto.randomUUID(),replacement=crypto.randomUUID();
 let m=await manage('propose',id,null,'测试政策：定金50%');assert.equal(m.status,'pending');assert.equal((await search()).length,0);
 await assert.rejects(()=>manage('confirm',id,99));
 m=await manage('confirm',id,1);assert.equal(m.status,'active');assert.equal(m.confirmed_by,owner);
 // New request and simulated next day use persisted approved memory, never previous message history.
 await db.exec(`reset role;update public.sculpy_operating_memory set confirmed_at=now()-interval '1 day' where id='${id}';set role authenticated;set request.jwt.claim.sub='${owner}';`);
 assert.equal((await search())[0].content,'测试政策：定金50%');
 await manage('propose',replacement,null,'测试政策：定金30%',id);assert.equal((await search())[0].id,id);
 await manage('confirm',replacement,1);assert.deepEqual((await search()).map(r=>r.id),[replacement]);
 assert.equal((await db.query('select status from public.sculpy_operating_memory where id=$1',[id])).rows[0].status,'superseded');
 await manage('revoke',replacement,2);assert.equal((await search()).length,0);
 assert.equal((await db.query('select * from public.sculpy_memory_audit')).rows.length,6);
 await assert.rejects(()=>db.query('update public.sculpy_operating_memory set content=$1',['forged']));
 await db.exec(`set request.jwt.claim.sub='${staff}';`);assert.equal((await search()).length,0);assert.equal((await db.query('select * from public.sculpy_memory_audit')).rows.length,0);
 await assert.rejects(()=>manage('propose',crypto.randomUUID(),null,'forged policy'));
 await db.exec('reset role;set role anon;');await assert.rejects(()=>search());
 }finally{await db.close();}
});
