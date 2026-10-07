import test from "node:test";
import assert from "node:assert/strict";
import { accountHandler } from "../supabase/functions/account-admin/handler.ts";
import {
  accountIdentifier,
  normalizeUsername,
} from "../src/domain/accounts.js";
const origin = "https://studio.test",
  id = "00000000-0000-0000-0000-000000000002";
function fixture({
  role = "operations",
  active = true,
  provisionError = false,
  resetError = false,
} = {}) {
  const calls = [];
  const admin = {
    auth: {
      admin: {
        createUser: async (body) => {
          calls.push(["create", body]);
          return { data: { user: { id } } };
        },
        deleteUser: async (id) => {
          calls.push(["delete", id]);
          return {};
        },
        updateUserById: async (id, body) => {
          calls.push(["reset", id, body]);
          return { error: resetError ? {} : null };
        },
      },
    },
    rpc: async (name, body) => {
      calls.push(["rpc", name, body]);
      return { error: provisionError ? {} : null };
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id, username: "sculp_staff" } }),
        }),
      }),
      insert: (body) => {
        calls.push(["audit", body]);
        return {
          select: () => ({ single: async () => ({ data: { id: "audit" } }) }),
        };
      },
      update: (body) => {
        calls.push(["outcome", body]);
        return { eq: async () => ({}) };
      },
    }),
  };
  const caller = {
    auth: { getUser: async () => ({ data: { user: { id: "admin-id" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { role, active } }) }),
      }),
    }),
  };
  const handler = accountHandler({
    allowedOrigins: new Set([origin]),
    admin,
    callerFor: () => caller,
  });
  const request = (body, authorization = "Bearer valid") =>
    handler(
      new Request("https://api.test", {
        method: "POST",
        headers: { origin, authorization, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  return { calls, request };
}
test("username normalization and internal mapping reject email inputs", () => {
  assert.equal(
    accountIdentifier(" SCULP_JZ "),
    "sculp_jz@accounts.sculp.invalid",
  );
  for (const value of [
    "jz",
    "sculp_",
    "a",
    "jz@example.com",
    "../jz",
    "a b",
    "中文",
    null,
  ])
    assert.throws(() => normalizeUsername(value));
});
test("unauthenticated, employee and disabled administrator cannot set passwords", async () => {
  for (const options of [{ role: "artist" }, { active: false }]) {
    const f = fixture(options);
    assert.equal(
      (
        await f.request({
          action: "reset-password",
          id,
          password: "password123",
        })
      ).status,
      403,
    );
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  assert.equal((await f.request({}, "")).status, 401);
  assert.deepEqual(f.calls, []);
});
test("admin creates account without sending email; provisioning failure removes auth orphan", async () => {
  for (const provisionError of [false, true]) {
    const f = fixture({ provisionError });
    const response = await f.request({
      action: "create",
      username: " SCULP_Staff ",
      displayName: "Employee",
      role: "artist",
      password: "password123",
    });
    assert.equal(response.status, provisionError ? 500 : 201);
    assert.equal(f.calls[0][1].email, "sculp_staff@accounts.sculp.invalid");
    assert.equal(f.calls[0][1].email_confirm, true);
    assert.equal(
      f.calls.some((c) => c[0] === "delete"),
      provisionError,
    );
    assert(
      !JSON.stringify(f.calls.filter((c) => c[0] === "rpc")).includes(
        "password123",
      ),
    );
  }
});
test("admin password reset is audited without password; short password rejected", async () => {
  const f = fixture();
  assert.equal(
    (await f.request({ action: "reset-password", id, password: "short" }))
      .status,
    400,
  );
  assert.deepEqual(f.calls, []);
  const result = await f.request({
    action: "reset-password",
    id,
    password: "password123",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(
    f.calls.find((c) => c[0] === "reset"),
    ["reset", id, { password: "password123" }],
  );
  assert(
    !JSON.stringify(f.calls.filter((c) => c[0] !== "reset")).includes(
      "password123",
    ),
  );
  assert.equal(f.calls.at(-1)[1].action, "password_reset_completed");
  const failure = fixture({ resetError: true });
  assert.equal(
    (
      await failure.request({
        action: "reset-password",
        id,
        password: "password123",
      })
    ).status,
    400,
  );
  assert.equal(failure.calls.at(-1)[1].action, "password_reset_failed");
});
