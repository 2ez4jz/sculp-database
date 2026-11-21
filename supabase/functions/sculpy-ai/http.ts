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

export function rateLimited(userId: string) {
  const now = Date.now();
  const recent = (requestLog.get(userId) || []).filter(
    (time) => now - time < 60_000,
  );
  if (recent.length >= 20) return true;
  if (requestLog.size > 1000) {
    for (const [id, times] of requestLog) if (now - times[times.length - 1] >= 60000) requestLog.delete(id);
  }
  recent.push(now);
  requestLog.set(userId, recent);
  return false;
}
