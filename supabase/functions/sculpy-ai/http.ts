const requestLog = new Map<string, number[]>();

export function cors(origin: string) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
}

export function json(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function rateLimited(request: Request) {
  const key =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter(
    (time) => now - time < 60_000,
  );
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > 20;
}
