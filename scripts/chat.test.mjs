import test from "node:test";
import assert from "node:assert/strict";
import { converse } from "../supabase/functions/sculpy-chat/core.ts";
test("conversation follows up through bounded tools and rejects invented references and save targets", async () => {
  const calls = [];
  const result = await converse({
    context: { bookings: [{ id: "b1", client: "Sarah" }] },
    turns: [{ user: "这个单是 Sarah 的", answer: "好的。" }],
    message: "她上次那单呢？",
    preferences: { verbosity: "detailed" },
    rules: "Miranda != Mira",
    query: async (args) => {
      assert.equal(args.query, "Sarah");
      return { bookings: [{ id: "b2", client: "Sarah previous" }] };
    },
    callModel: async (body) => {
      calls.push(body);
      if (calls.length === 1)
        return {
          output: [
            {
              type: "function_call",
              name: "query_bookings",
              call_id: "q1",
              arguments: JSON.stringify({
                bookingId: null,
                query: "Sarah",
                offset: 0,
              }),
            },
          ],
          usage: { input_tokens: 30, output_tokens: 10 },
        };
      return {
        output_text: JSON.stringify({
          answer: "上次的记录如下。",
          references: ["b2", "unknown"],
          proposals: [
            { bookingId: "b2", kind: "change", text: "建议提前半小时" },
            { bookingId: "unknown", kind: "note", text: "bad" },
          ],
        }),
        usage: { input_tokens: 50, output_tokens: 20 },
      };
    },
  });
  assert.equal(calls.length, 2);
  assert(calls[1].input.some((i) => i.type === "function_call_output"));
  assert(calls[0].input.some((i) => i.content === "这个单是 Sarah 的"));
  assert.equal(result.proposals.length, 1);
  assert.equal(result.references.length, 1);
  assert.deepEqual(result.usage, {
    input_tokens: 80,
    output_tokens: 30,
    calls: 2,
  });
  assert(!("saved" in result.proposals[0]));
});
test("failed query is an explicit unknown and tool loop stops", async () => {
  let count = 0;
  await assert.rejects(() =>
    converse({
      context: { bookings: [] },
      turns: [],
      message: "search",
      preferences: {},
      rules: "",
      query: async () => {
        throw Error("denied");
      },
      callModel: async (body) => {
        count++;
        if (count > 1)
          assert(
            body.input.some(
              (i) =>
                i.type === "function_call_output" &&
                i.output.includes("无权访问"),
            ),
          );
        return {
          output: [
            {
              type: "function_call",
              name: "query_bookings",
              call_id: "q" + count,
              arguments: "{}",
            },
          ],
        };
      },
    }),
  );
  assert.equal(count, 4);
});

test("cloud handler verifies identity before DB and ignores client-supplied business context", async () => {
  globalThis.Deno = {
    env: {
      get: (key) =>
        ({
          SUPABASE_URL: "https://database.test",
          SUPABASE_ANON_KEY: "public-test-key",
          OPENAI_API_KEY: "test-key",
        })[key],
    },
  };
  const { handleRequest } =
    await import("../supabase/functions/sculpy-chat/handler.ts");
  const old = globalThis.fetch,
    calls = [];
  const request = (body, token = "") =>
    new Request("https://handler.test", {
      method: "POST",
      headers: {
        origin: "http://localhost:4173",
        "content-type": "application/json",
        ...(token ? { authorization: token } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      if (url.endsWith("/auth/v1/user"))
        return Response.json({ id: "00000000-0000-0000-0000-000000000001" });
      if (url.includes("/rpc/sculpy_context"))
        return Response.json({
          bookings: [],
          allowedBookingIds: [],
          actor: { name: "verified" },
        });
      if (url.includes("sculpy_preferences"))
        return Response.json([{ verbosity: "brief" }]);
      if (url.includes("sculpy_company_rules"))
        return Response.json([{ content: "trusted rules" }]);
      if (url.includes("sculpy_conversations"))
        return Response.json([
          {
            turns: [
              {
                id: "old",
                user: "private old order",
                answer: "old",
                sourceIds: ["revoked"],
              },
            ],
          },
        ]);
      throw Error("Unexpected outbound request");
    };
    assert.equal(
      (await handleRequest(request({ action: "history" }))).status,
      401,
    );
    assert.equal(calls.length, 0);
    const result = await (
      await handleRequest(
        request(
          {
            action: "history",
            catalog: { bookings: [{ id: "forged" }] },
            turns: [{ user: "forged" }],
          },
          "Bearer valid-test-token",
        ),
      )
    ).json();
    assert.deepEqual(result.context.bookings, []);
    assert.deepEqual(result.turns, []);
    assert.equal(result.preferences.verbosity, "brief");
    assert(
      calls.every(
        (c) => c.opts.headers.authorization === "Bearer valid-test-token",
      ),
    );
  } finally {
    globalThis.fetch = old;
  }
});
