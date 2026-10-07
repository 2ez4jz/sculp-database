import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { PGlite } = createRequire(import.meta.url)("@electric-sql/pglite");
test("account RPCs enforce server roles, self-protection, revocation and audit", async () => {
  const db = new PGlite();
  const jz = "00000000-0000-0000-0000-000000000001",
    staff = "00000000-0000-0000-0000-000000000002";
  try {
    await db.exec(
      `create role anon;create role service_role;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated;`,
    );
    for (const file of [
      "001_initial_schema",
      "002_production_core",
      "003_context_memory",
      "004_account_management",
      "005_username_accounts",
    ])
      await db.exec(
        (
          await readFile(
            new URL("../supabase/migrations/" + file + ".sql", import.meta.url),
            "utf8",
          )
        ).replace("create extension if not exists pgcrypto;", ""),
      );
    await db.exec(
      `insert into auth.users values('${jz}','jz@example.test'),('${staff}','staff@example.test');insert into profiles(id,display_name,role) values('${jz}','Jz','operations'),('${staff}','Staff','artist');set role authenticated;set request.jwt.claim.sub='${staff}';`,
    );
    await assert.rejects(
      db.query("select * from list_managed_accounts()"),
      /Administrator/,
    );
    await assert.rejects(
      db.query("select update_managed_account($1,$2,$3,$4)", [
        staff,
        "Jz",
        "operations",
        true,
      ]),
      /Administrator/,
    );
    await db.exec(`set request.jwt.claim.sub='${jz}'`);
    assert.equal(
      (await db.query("select * from list_managed_accounts()")).rows.length,
      2,
    );
    await assert.rejects(
      db.query("select update_managed_account($1,$2,$3,$4)", [
        jz,
        "Jz",
        "artist",
        true,
      ]),
      /own administrator/,
    );
    await assert.rejects(
      db.query("select update_managed_account($1,$2,$3,$4)", [
        jz,
        "Jz",
        "operations",
        false,
      ]),
      /own administrator/,
    );
    await db.query("select update_managed_account($1,$2,$3,$4)", [
      staff,
      "Updated",
      "artist",
      false,
    ]);
    await db.exec(`set request.jwt.claim.sub='${staff}'`);
    assert.equal(
      (await db.query("select current_app_role() as role")).rows[0].role,
      null,
    );
    await assert.rejects(
      db.query("update profiles set role='operations' where id=$1", [staff]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select provision_managed_account($1,$2,$3,$4,$5)", [
        jz,
        staff,
        "staff",
        "Staff",
        "artist",
      ]),
      /permission denied/,
    );
    await db.exec("reset role");
    const created = "00000000-0000-0000-0000-000000000003";
    await db.query("insert into auth.users values($1,$2)", [
      created,
      "sculp_michelle@accounts.sculp.invalid",
    ]);
    await db.query("select provision_managed_account($1,$2,$3,$4,$5)", [
      jz,
      created,
      "sculp_michelle",
      "Michelle",
      "artist",
    ]);
    assert.equal(
      (await db.query("select username from profiles where id=$1", [created]))
        .rows[0].username,
      "sculp_michelle",
    );
    await assert.rejects(
      db.query("select provision_managed_account($1,$2,$3,$4,$5)", [
        staff,
        created,
        "sculp_michelle",
        "Michelle",
        "operations",
      ]),
      /Administrator/,
    );

    assert.equal(
      (
        await db.query(
          "select count(*)::int as count from audit_events where action='account_update'",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});
