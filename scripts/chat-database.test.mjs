import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { PGlite } = createRequire(import.meta.url)("@electric-sql/pglite");
const owner = "00000000-0000-0000-0000-000000000001",
  staff = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003",
  artist = "10000000-0000-0000-0000-000000000001",
  client = "20000000-0000-0000-0000-000000000001",
  b1 = "30000000-0000-0000-0000-000000000001",
  b2 = "30000000-0000-0000-0000-000000000002";
test("cloud context enforces assignments, hides financial columns, isolates memory, respects inactive profiles", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const file of [
      "001_initial_schema.sql",
      "002_production_core.sql",
      "003_context_memory.sql",
      "20261007222258_sculpy_conversations.sql",
    ])
      await db.exec(
        (
          await readFile(
            new URL("../supabase/migrations/" + file, import.meta.url),
            "utf8",
          )
        ).replace("create extension if not exists pgcrypto;", ""),
      );
    await db.exec(
      `insert into auth.users values('${owner}'),('${staff}'),('${other}');insert into public.profiles(id,display_name,role) values('${owner}','Jz','operations'),('${staff}','Emily','artist'),('${other}','Other','artist');insert into public.artists(id,slug,profile_id,name,level) values('${artist}','emily','${staff}','Emily','Senior');insert into public.clients(id,display_name) values('${client}','Sarah');insert into public.bookings(id,client_id,starts_at,price_cad) values('${b1}','${client}',now(),1000),('${b2}','${client}',now(),2000);insert into public.booking_artists values('${b1}','${artist}','lead');set role authenticated;set request.jwt.claim.sub='${staff}';`,
    );
    const context = async (id) =>
      (await db.query("select public.sculpy_context($1) as data", [id])).rows[0]
        .data;
    let data = await context(null);
    assert.equal(data.bookings.length, 1);
    assert(!("price_cad" in data.bookings[0]));
    await assert.rejects(() => context(b2));
    await db.query(
      "insert into public.sculpy_preferences(user_id,instructions) values($1,'My private preference')",
      [staff],
    );
    await assert.rejects(() =>
      db.query("insert into public.sculpy_preferences(user_id) values($1)", [
        other,
      ]),
    );
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    data = await context(null);
    assert.equal(data.bookings.length, 2);
    assert(data.bookings[0].price_cad > 0);
    assert.equal(
      (await db.query("select * from public.sculpy_preferences")).rows.length,
      0,
    );
    await db.exec(
      `reset role;update public.profiles set active=false where id='${staff}';set role authenticated;set request.jwt.claim.sub='${staff}';`,
    );
    await assert.rejects(() => context(b1));
    assert.equal(
      (await db.query("select * from public.sculpy_preferences")).rows.length,
      0,
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(() => context(null));
  } finally {
    await db.close();
  }
});
