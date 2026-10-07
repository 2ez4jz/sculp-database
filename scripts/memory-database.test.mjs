import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { PGlite } = createRequire(import.meta.url)("@electric-sql/pglite");
const ids = {
  owner: "00000000-0000-0000-0000-000000000001",
  staff: "00000000-0000-0000-0000-000000000002",
  other: "00000000-0000-0000-0000-000000000003",
  artist: "10000000-0000-0000-0000-000000000001",
  artist2: "10000000-0000-0000-0000-000000000002",
  client: "20000000-0000-0000-0000-000000000001",
  booking: "30000000-0000-0000-0000-000000000001",
  unassigned: "30000000-0000-0000-0000-000000000002",
};
test("context memory SQL validates permissions, commits atomically, audits and deduplicates", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    for (const file of [
      "001_initial_schema.sql",
      "002_production_core.sql",
      "003_context_memory.sql",
    ]) {
      const sql = (
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        )
      ).replace("create extension if not exists pgcrypto;", "");
      await db.exec(sql);
    }
    await db.exec(`insert into auth.users values ('${ids.owner}'),('${ids.staff}'),('${ids.other}');
 insert into public.profiles(id,display_name,role) values('${ids.owner}','Owner','owner'),('${ids.staff}','Staff','artist'),('${ids.other}','Other','artist');
 insert into public.artists(id,slug,profile_id,name,level) values('${ids.artist}','staff','${ids.staff}','Staff','Senior'),('${ids.artist2}','other','${ids.other}','Other','Senior');
 insert into public.clients(id,display_name) values('${ids.client}','Client');
 insert into public.bookings(id,client_id,starts_at) values('${ids.booking}','${ids.client}',now()),('${ids.unassigned}','${ids.client}',now());
 insert into public.booking_artists(booking_id,artist_id) values('${ids.booking}','${ids.artist}');
 -- Base-table grants mimic an authenticated Supabase reader. New tables retain SELECT only.
 grant select on public.profiles,public.artists,public.bookings,public.booking_artists,public.clients to authenticated;
 set role authenticated;set request.jwt.claim.sub='${ids.staff}';`);
    const call = async (request, items, target = ids.booking) =>
      db.query(
        "select public.save_context_memory($1,$2,$3,$4,$5,$6) as result",
        [
          request,
          "booking",
          target,
          "original voice note",
          "voice",
          JSON.stringify(items),
        ],
      );
    const request = "40000000-0000-0000-0000-000000000001";
    const items = [
      {
        kind: "note",
        entityType: "booking",
        entityId: ids.booking,
        text: "work note",
        status: "confirmed",
      },
      {
        kind: "preference",
        entityType: "client",
        entityId: ids.client,
        text: "light makeup",
        status: "confirmed",
      },
      {
        kind: "task",
        entityType: "booking",
        entityId: ids.booking,
        text: "follow up next week",
        dueDate: null,
        assigneeId: ids.artist,
      },
    ];
    await call(request, items);
    let result = await db.query(
      "select kind,status,due_date from public.context_memory_items order by position",
    );
    assert.equal(result.rows[1].status, "pending_review");
    assert.equal(result.rows[2].due_date, null);
    assert.equal((await call(request, items)).rows[0].result.replayed, true);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.context_memory_items",
        )
      ).rows[0].n,
      3,
    );
    await assert.rejects(
      call("40000000-0000-0000-0000-000000000002", items, ids.unassigned),
      /Not allowed/,
    );
    await assert.rejects(
      call("40000000-0000-0000-0000-000000000003", [
        items[0],
        { ...items[0], entityId: ids.unassigned },
      ]),
      /linked entity/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.context_memory_batches",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.exec("update public.context_memory_items set status='confirmed'"),
      /permission denied/,
    );
    await db.exec(`set request.jwt.claim.sub='${ids.other}';`);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.context_memory_items",
        )
      ).rows[0].n,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${ids.owner}';`);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.context_memory_items",
        )
      ).rows[0].n,
      3,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.audit_events where action='confirmed'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.ai_drafts"))
        .rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
