import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Bootstrap a local Supabase-like Auth schema and default API grants. Real
// Supabase authentication/deployment is tested separately with test accounts.
export async function migrate(db, {pglite=false}={}) {
  await db.exec(`do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
  end$$;
  create schema auth;create table auth.users(id uuid primary key,email text);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth to anon,authenticated,service_role;
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const dir=new URL('../../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()) {
    let sql=await readFile(new URL(name,dir),'utf8');
    if(pglite)sql=sql.replace('create extension if not exists pgcrypto;','');
    try { await db.exec(sql); } catch(error) { error.message=`${name}: ${error.message}`;throw error; }
  }
}

export async function createDatabase({applyMigrations=true}={}) {
  const url=process.env.SCULPY_TEST_DATABASE_URL;
  if(!url) {
    const db=new PGlite();
    try { if(applyMigrations)await migrate(db,{pglite:true});return db; }
    catch(error){await db.close();throw error;}
  }
  const parsed=new URL(url);
  if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw Error('Database tests require a local PostgreSQL server.');
  const {Client}=await import('pg');
  const admin=new Client({connectionString:url});await admin.connect();
  const name='sculpy_test_'+randomUUID().replaceAll('-','');
  let client;
  try {
    await admin.query(`create database "${name}"`);
    parsed.pathname='/'+name;
    client=new Client({connectionString:parsed.toString()});await client.connect();
    const db={databaseName:name,exec:sql=>client.query(sql),query:(sql,args)=>client.query(sql,args),
      connect:async()=>{const c=new Client({connectionString:parsed.toString()});await c.connect();return {
        exec:sql=>c.query(sql),query:(sql,args)=>c.query(sql,args),end:()=>c.end(),
      };},
      close:async()=>{await client.end();await admin.query(`drop database "${name}" with (force)`);await admin.end();}};
    if(applyMigrations)await migrate(db);return db;
  } catch(error) {
    if(client)await client.end();
    await admin.query(`drop database if exists "${name}" with (force)`);await admin.end();throw error;
  }
}
