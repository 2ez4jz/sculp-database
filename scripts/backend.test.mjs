// Protocol tests with stubbed runtime configuration and OpenAI; no secrets/network.
import test from "node:test";
import assert from "node:assert/strict";
globalThis.Deno = {
  env: { get: (name) => (name === "OPENAI_API_KEY" ? "test-key" : undefined) },
};
const { handleRequest } =
  await import("../supabase/functions/sculpy-ai/handler.ts");
const origin = "http://localhost:4173";
function request(action, body, extra = {}) {
  return new Request(`http://example.test/?action=${action}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  });
}
test("HTTP boundary preserves origin, method, validation and rate responses", async () => {
  assert.equal(
    (
      await handleRequest(
        new Request("http://example.test", {
          headers: { origin: "https://untrusted.test" },
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleRequest(
        new Request("http://example.test", {
          method: "OPTIONS",
          headers: { origin },
        }),
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await handleRequest(
        new Request("http://example.test", { headers: { origin } }),
      )
    ).status,
    405,
  );
  assert.equal(
    (await handleRequest(request("extract", { rawText: "" }))).status,
    400,
  );
  assert.equal(
    (await handleRequest(request("search", { query: "x".repeat(301) }))).status,
    400,
  );
  assert.equal((await handleRequest(request("unknown", {}))).status, 404);
  for (let i = 0; i < 20; i++)
    assert.equal(
      (
        await handleRequest(
          request("unknown", {}, { "x-forwarded-for": "limit-test" }),
        )
      ).status,
      404,
    );
  assert.equal(
    (
      await handleRequest(
        request("unknown", {}, { "x-forwarded-for": "limit-test" }),
      )
    ).status,
    429,
  );
});
test("extraction and search retain structured output and filter unknown IDs", async () => {
  const old = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Response.json({
      output_text: JSON.stringify(
        calls.length === 1
          ? {
              summary: "摘要",
              preferences: [],
              opportunities: [],
              partners: [],
              confidence: 0.9,
            }
          : {
              answer: "答案",
              results: [
                { kind: "booking", id: "b0" },
                { kind: "booking", id: "unknown" },
              ],
              evidenceIds: ["b0", "unknown"],
            },
      ),
    });
  };
  try {
    const extraction = await handleRequest(
      request("extract", { rawText: "今天的工作", bookingId: "b0" }),
    );
    assert.equal(extraction.status, 200);
    assert.equal((await extraction.json()).summary, "摘要");
    const result = await (
      await handleRequest(
        request("search", {
          query: "婚礼",
          catalog: { bookings: [{ id: "b0" }] },
        }),
      )
    ).json();
    assert.deepEqual(result.results, [{ kind: "booking", id: "b0" }]);
    assert.deepEqual(result.evidenceIds, ["b0"]);
    assert.equal(calls[0].body.text.format.name, "sculpy_work_memory");
    assert.equal(calls[1].body.text.format.name, "sculpy_database_search");
    assert(calls.every((c) => c.body.store === false));
  } finally {
    globalThis.fetch = old;
  }
});
test("transcription preserves multipart model and response, rejects empty files", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert(url.endsWith("/audio/transcriptions"));
    assert.equal(options.body.get("model"), "gpt-transcribe");
    return Response.json(
      { text: "工作记录" },
      { headers: { "x-request-id": "test-id" } },
    );
  };
  try {
    const form = new FormData();
    form.append("audio", new File(["audio"], "test.webm"));
    const result = await handleRequest(
      new Request("http://example.test/?action=transcribe", {
        method: "POST",
        headers: { origin },
        body: form,
      }),
    );
    assert.deepEqual(await result.json(), {
      text: "工作记录",
      provider: "openai",
      requestId: "test-id",
    });
    const empty = new FormData();
    empty.append("audio", new File([], "empty.webm"));
    assert.equal(
      (
        await handleRequest(
          new Request("http://example.test/?action=transcribe", {
            method: "POST",
            headers: { origin },
            body: empty,
          }),
        )
      ).status,
      400,
    );
  } finally {
    globalThis.fetch = old;
  }
});

test("context extraction passes an explicit target and filters hallucinated destinations", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.text.format.name, "sculpy_context_memory");
    assert.equal(JSON.parse(payload.input).selected.id, "b0");
    return Response.json({
      output_text: JSON.stringify({
        summary: "note",
        items: [
          {
            kind: "preference",
            entityType: "client",
            entityId: "c0",
            text: "light",
          },
          {
            kind: "task",
            entityType: "booking",
            entityId: "wrong",
            text: "wrong",
          },
          {
            kind: "preference",
            entityType: "booking",
            entityId: "b0",
            text: "wrong type",
          },
        ],
        warnings: [],
        confidence: 0.8,
      }),
    });
  };
  try {
    const result = await (
      await handleRequest(
        request("extract", {
          rawText: "note",
          pageContext: {
            mode: "context_memory",
            entity: { type: "booking", id: "b0", label: "Sarah" },
            related: [{ type: "client", id: "c0", label: "Sarah" }],
          },
        }),
      )
    ).json();
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].entityId, "c0");
  } finally {
    globalThis.fetch = old;
  }
});
