import {
  accountIdentifier,
  normalizeUsername,
} from "../../../src/domain/accounts.js";
const roles = new Set(["operations", "owner", "admin", "artist", "read_only"]);
// Dependencies are injected so authorization and failure cases can be tested without secrets.
export function accountHandler({ callerFor, admin, allowedOrigins }: any) {
  return async (request: Request) => {
    const origin = request.headers.get("origin") || "";
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      ...(allowedOrigins.has(origin)
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers":
              "authorization,apikey,content-type,x-client-info",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
          }
        : {}),
    };
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (!allowedOrigins.has(origin))
      return reply({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return reply({ error: "Method not allowed" }, 405);
    try {
      const authorization = request.headers.get("authorization") || "";
      if (!authorization.startsWith("Bearer "))
        return reply({ error: "请重新登录。" }, 401);
      const caller = callerFor(authorization);
      const {
        data: { user },
        error: authError,
      } = await caller.auth.getUser();
      if (authError || !user) return reply({ error: "请重新登录。" }, 401);
      const { data: profile, error: profileError } = await caller
        .from("profiles")
        .select("role,active")
        .eq("id", user.id)
        .single();
      if (profileError || !profile?.active || profile.role !== "operations")
        return reply({ error: "仅系统管理员可管理密码。" }, 403);
      const raw = await request.text();
      if (raw.length > 4096) return reply({ error: "请求过大。" }, 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply({ error: "请求格式错误。" }, 400);
      }
      if (!body || typeof body !== "object")
        return reply({ error: "请求格式错误。" }, 400);
      if (
        typeof body.password !== "string" ||
        body.password.length < 8 ||
        body.password.length > 128
      )
        return reply({ error: "密码需为 8–128 位。" }, 400);
      if (body.action === "create") {
        let username;
        try {
          username = normalizeUsername(body.username);
        } catch {
          return reply(
            {
              error:
                "账号格式为 sculp_名字，名字使用 1–26 位英文字母、数字或下划线。",
            },
            400,
          );
        }
        if (
          typeof body.displayName !== "string" ||
          !body.displayName.trim() ||
          body.displayName.trim().length > 80 ||
          !roles.has(body.role)
        )
          return reply({ error: "请填写姓名并选择有效角色。" }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email: accountIdentifier(username),
          password: body.password,
          email_confirm: true,
        });
        if (error || !data?.user)
          return reply(
            { error: "创建失败，账号可能已存在或密码不符合要求。" },
            409,
          );
        const { error: saveError } = await admin.rpc(
          "provision_managed_account",
          {
            p_actor: user.id,
            p_id: data.user.id,
            p_username: username,
            p_display_name: body.displayName.trim(),
            p_role: body.role,
          },
        );
        if (saveError) {
          const { error: cleanupError } = await admin.auth.admin.deleteUser(
            data.user.id,
          );
          return reply(
            {
              error: cleanupError
                ? "创建未完成，请联系项目管理员清理未完成账户。"
                : "创建未完成，未保存账户，请重试。",
            },
            500,
          );
        }
        return reply({ ok: true, id: data.user.id }, 201);
      }
      if (body.action === "reset-password") {
        if (
          typeof body.id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            body.id,
          )
        )
          return reply({ error: "无效账户。" }, 400);
        const { data: target, error: targetError } = await admin
          .from("profiles")
          .select("id,username")
          .eq("id", body.id)
          .single();
        if (targetError || !target?.username)
          return reply({ error: "账户不存在或尚未绑定账号。" }, 404);
        // Audit only intent/outcome and IDs. Never log the request, password or Auth response.
        const { data: audit, error: auditError } = await admin
          .from("audit_events")
          .insert({
            actor_id: user.id,
            entity_type: "profiles",
            entity_id: body.id,
            action: "password_reset_requested",
          })
          .select("id")
          .single();
        if (auditError)
          return reply({ error: "无法记录操作，请稍后重试。" }, 500);
        const { error } = await admin.auth.admin.updateUserById(body.id, {
          password: body.password,
        });
        const { error: outcomeError } = await admin
          .from("audit_events")
          .update({
            action: error
              ? "password_reset_failed"
              : "password_reset_completed",
          })
          .eq("id", audit.id);
        if (error)
          return reply({ error: "密码重置失败，请检查密码要求后重试。" }, 400);
        return reply({
          ok: true,
          ...(outcomeError
            ? { warning: "密码已重置，操作结果日志待项目管理员核查。" }
            : {}),
        });
      }
      return reply({ error: "未知操作。" }, 400);
    } catch {
      return reply({ error: "账户服务暂时不可用，请稍后重试。" }, 500);
    }
  };
}
