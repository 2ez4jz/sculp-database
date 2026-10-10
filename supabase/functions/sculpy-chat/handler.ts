import { converse } from "./core.ts";
const env = (key: string) => Deno.env.get(key) || "";
const origins = new Set(
  (
    env("SCULPY_ALLOWED_ORIGINS") ||
    "https://2ez4jz.github.io,http://localhost:4173,http://127.0.0.1:4173"
  )
    .split(",")
    .map((x) => x.trim()),
);
const limits = new Map<string, { n: number; time: number }>();
const uuid = (s: any) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export async function handleRequest(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
    "content-type": "application/json",
  };
  const reply = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (!origins.has(origin)) return reply({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 180000)
      return reply({ error: "本次内容太多，请分段发送。" }, 413);
    const body = JSON.parse(raw);
    const demo = body.mode === "demo";
    const token = req.headers.get("authorization") || "";
    const rest = async (path: string, options: any = {}) => {
      const response = await fetch(env("SUPABASE_URL") + path, {
        ...options,
        headers: {
          apikey: env("SUPABASE_ANON_KEY"),
          authorization: token,
          "content-type": "application/json",
          ...(options.headers || {}),
        },
      });
      if (!response.ok) throw Error("数据库读取或保存失败，请检查权限并重试。");
      return response.status === 204 ? null : response.json();
    };
    const rpc = (name: string, args: any) =>
      rest("/rest/v1/rpc/" + name, {
        method: "POST",
        body: JSON.stringify(args),
      });
    let actor: any,
      context: any,
      turns: any[] = [],
      preferences: any,
      rules = "",
      session: any;
    const scope = body.bookingId || "global";
    if (!demo) {
      if (!/^Bearer\s+\S+$/i.test(token))
        return reply({ error: "请先登录。" }, 401);
      const check = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
        headers: { apikey: env("SUPABASE_ANON_KEY"), authorization: token },
      });
      if (!check.ok) return reply({ error: "登录已失效，请重新登录。" }, 401);
      actor = await check.json();
      if (body.bookingId && !uuid(body.bookingId))
        return reply({ error: "订单编号无效" }, 400);
      context = await rpc("sculpy_context", {
        p_booking_id: body.bookingId || null,
        p_query: "",
        p_offset: 0,
      });
      const results = await Promise.all([
        rest(
          `/rest/v1/sculpy_preferences?user_id=eq.${actor.id}&select=verbosity,instructions`,
        ),
        rest("/rest/v1/sculpy_company_rules?select=content"),
        rest(
          `/rest/v1/sculpy_conversations?user_id=eq.${actor.id}&scope=eq.${encodeURIComponent(scope)}&select=turns,updated_at`,
        ),
      ]);
      preferences = results[0][0] || { verbosity: "detailed" };
      rules = results[1][0]?.content || "";
      session = results[2][0];
      const allowed = new Set(context.allowedBookingIds);
      turns = (session?.turns || []).filter(
        (t: any) =>
          Array.isArray(t.sourceIds) &&
          t.sourceIds.every((id: any) => allowed.has(id)),
      );
    } else {
      const list = Array.isArray(body.catalog?.bookings)
        ? body.catalog.bookings.slice(0, 200)
        : [];
      context = {
        mode: "fictional_demo",
        bookings: list,
        notes: (body.catalog?.notes || []).slice(0, 80),
        currentBookingId: body.bookingId || null,
        asOf: new Date().toISOString(),
        timezone: "America/Toronto",
        total: list.length,
        advisorFixture: body.advisorFixture?.version === "sculp-300-v1" && body.advisorFixture?.fictional === true ? {
          mode: "fictional_fixture_only",
          summary: body.advisorFixture.summary,
          insights: body.advisorFixture.insights,
          byMonth: body.advisorFixture.byMonth,
          byService: body.advisorFixture.byService,
          byChannel: body.advisorFixture.byChannel,
        } : null,
      };
      turns = (Array.isArray(body.turns) ? body.turns : [])
        .filter(
          (t: any) =>
            typeof t.user === "string" && typeof t.answer === "string",
        )
        .slice(-12)
        .map((t: any) => ({
          ...t,
          user: t.user.slice(0, 4000),
          answer: t.answer.slice(0, 16000),
        }));
      preferences = {
        verbosity: ["brief", "balanced", "detailed"].includes(
          body.preferences?.verbosity,
        )
          ? body.preferences.verbosity
          : "detailed",
        instructions: String(body.preferences?.instructions || "").slice(
          0,
          1000,
        ),
      };
      rules =
        "这是虚构演示数据。任何保存只发生在浏览器。不得声称已写入正式数据库。";
    }
    context.timezone = context.timezone || "America/Toronto";
    context.localDate = new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    context.currentBookingId = body.bookingId || null;
    context.coverage = {
      workLogs: "latest 20",
      contextRecords: "latest 30",
      conversationTurns: "latest 12",
    };
    if (body.action === "history")
      return reply({
        turns,
        preferences,
        context: { ...context, allowedBookingIds: undefined },
      });
    const key =
      actor?.id || req.headers.get("x-forwarded-for")?.split(",")[0] || "demo";
    const now = Date.now(),
      recent = limits.get(key);
    const limit =
      recent && now - recent.time < 60000 ? recent : { n: 0, time: now };
    limit.n++;
    limits.set(key, limit);
    if (limits.size > 5000) limits.clear();
    if (limit.n > 15) return reply({ error: "请求较多，请稍后继续。" }, 429);
    if (!uuid(body.requestId)) return reply({ error: "请求编号无效。" }, 400);
    const existing = turns.find((t) => t.id === body.requestId);
    if (existing) return reply({ turn: existing, replayed: true });
    const message = String(body.message || "").trim();
    if (!message || message.length > 4000)
      return reply({ error: "请输入 1–4000 字。" }, 400);
    delete context.allowedBookingIds;
    const result = await converse({
      context,
      turns,
      message,
      preferences,
      rules,
      query: async (args: any) => {
        if (demo) {
          const rows = context.bookings.filter(
            (b: any) =>
              (!args.bookingId || b.id === args.bookingId) &&
              (!args.query ||
                JSON.stringify(b)
                  .toLowerCase()
                  .includes(String(args.query).toLowerCase())),
          );
          return {
            bookings: rows.slice(args.offset, args.offset + 30),
            total: rows.length,
            notes: context.notes.filter((n: any) =>
              rows.some((b: any) => b.id === n.entityId),
            ),
          };
        }
        if (args.bookingId && !uuid(args.bookingId)) throw Error("Invalid ID");
        const result = await rpc("sculpy_context", {
          p_booking_id: args.bookingId || null,
          p_query: String(args.query || "").slice(0, 200),
          p_offset: Math.max(0, Math.min(Number(args.offset) || 0, 100000)),
        });
        delete result.allowedBookingIds;
        return result;
      },
      callModel: async (payload: any) => {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            authorization: `Bearer ${env("OPENAI_API_KEY")}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-6-luna",
            store: false,
            reasoning: { effort: "low" },
            max_output_tokens: 5000,
            ...payload,
          }),
          signal: AbortSignal.timeout(55000),
        });
        if (!response.ok)
          throw Error("AI 服务暂时不可用，原话已保留，请稍后重试。");
        return response.json();
      },
    });
    const turn = {
      id: body.requestId,
      user: message,
      ...result,
      createdAt: new Date().toISOString(),
    };
    if (!demo) {
      const record = {
        user_id: actor.id,
        scope,
        turns: [...turns, turn].slice(-100),
        updated_at: new Date().toISOString(),
      };
      if (session) {
        const saved = await rest(
          `/rest/v1/sculpy_conversations?user_id=eq.${actor.id}&scope=eq.${encodeURIComponent(scope)}&updated_at=eq.${encodeURIComponent(session.updated_at)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(record),
          },
        );
        if (!saved.length)
          return reply(
            { error: "另一窗口更新了此对话，请重新打开后再发送。" },
            409,
          );
      } else
        await rest("/rest/v1/sculpy_conversations", {
          method: "POST",
          body: JSON.stringify(record),
          headers: { Prefer: "return=representation" },
        });
    }
    return reply({ turn });
  } catch (error) {
    console.error(
      "sculpy-chat failed",
      error instanceof Error ? error.name : "Error",
    );
    return reply(
      { error: error instanceof Error ? error.message : "请求失败，请重试。" },
      500,
    );
  }
}
