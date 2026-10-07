import { config } from "../config.js";
export async function chatRequest(body, supabase) {
  const headers = { "content-type": "application/json" };
  if (supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw Error("请重新登录。");
    headers.authorization = `Bearer ${data.session.access_token}`;
    headers.apikey = config.supabasePublishableKey;
  }
  const response = await fetch(
    `${config.supabaseUrl}/functions/v1/sculpy-chat`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    },
  );
  const data = await response
    .json()
    .catch(() => ({ error: "服务未返回完整结果。" }));
  if (!response.ok) throw Error(data.error || "请求失败，请重试。");
  return data;
}
export function demoChatAdapter({
  getIdentity,
  getCatalog,
  getContext,
  saveBatch,
}) {
  const key = () => `sculpy-chat-v1:${getIdentity()}`;
  const read = (storageKey = key()) => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  };
  const write = (value, storageKey = key()) => {
    localStorage.setItem(storageKey, JSON.stringify(value));
  };
  return {
    mode: "demo",
    identity: getIdentity,
    async load(scope) {
      const state = read();
      return {
        turns: state[scope] || [],
        preferences: state.preferences || {
          verbosity: "detailed",
          instructions: "",
        },
      };
    },
    async preferences(value) {
      const state = read();
      write({ ...state, preferences: value });
    },
    async send(scope, body) {
      const storageKey = key(),
        state = read(storageKey),
        history = state[scope] || [];
      let result;
      if (config.aiMode === "mock")
        result = {
          turn: {
            id: body.requestId,
            user: body.message,
            answer:
              "这是模拟聊天回复。连续对话和个人偏好已保留；在线模式会读取相关订单再回答。",
            references: [],
            proposals: [],
            sourceIds: [],
            createdAt: new Date().toISOString(),
          },
        };
      else
        result = await chatRequest({
          mode: "demo",
          ...body,
          bookingId: scope === "global" ? null : scope,
          catalog: getCatalog(),
          turns: history,
          preferences: state.preferences,
        });
      const fresh = read(storageKey);
      write(
        {
          ...fresh,
          [scope]: [...(fresh[scope] || []), result.turn].slice(-100),
        },
        storageKey,
      );
      return result.turn;
    },
    async save(proposal, turn) {
      const context = getContext();
      return saveBatch({
        id: proposal.id,
        entityType: "booking",
        entityId: proposal.bookingId,
        rawText: turn.user,
        inputType: "text",
        createdBy:
          context.role === "admin" ? context.adminPersona : context.artistId,
        createdAt: new Date().toISOString(),
        items: [
          {
            id: crypto.randomUUID(),
            kind: proposal.kind,
            entityType: "booking",
            entityId: proposal.bookingId,
            text: proposal.text,
            status: proposal.kind === "change" ? "pending_review" : "confirmed",
            dueDate: null,
            assigneeId: null,
          },
        ],
      });
    },
  };
}
export function cloudChatAdapter(supabase, profile) {
  return {
    mode: "cloud",
    identity: () => profile.id,
    async load(scope) {
      return chatRequest(
        { action: "history", bookingId: scope === "global" ? null : scope },
        supabase,
      );
    },
    async preferences(value) {
      const { error } = await supabase
        .from("sculpy_preferences")
        .upsert({
          user_id: profile.id,
          ...value,
          updated_at: new Date().toISOString(),
        });
      if (error) throw Error("偏好保存失败，请重试。");
    },
    async send(scope, body) {
      return (
        await chatRequest(
          { ...body, bookingId: scope === "global" ? null : scope },
          supabase,
        )
      ).turn;
    },
    async save(proposal, turn) {
      const { data, error } = await supabase.rpc("save_context_memory", {
        p_request_id: proposal.id,
        p_entity_type: "booking",
        p_entity_id: proposal.bookingId,
        p_raw_text: turn.user,
        p_input_type: "text",
        p_items: [
          {
            kind: proposal.kind,
            entityType: "booking",
            entityId: proposal.bookingId,
            text: proposal.text,
            dueDate: null,
            assigneeId: null,
          },
        ],
      });
      if (error || !data?.id)
        throw Error("保存失败，内容仍保留，请检查权限后重试。");
      return data;
    },
  };
}
