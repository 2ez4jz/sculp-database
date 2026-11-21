import {config} from "../config.js";
import {transcribeAudio} from "./sculpy.js?v=team-20261121";
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
export function cloudChatAdapter(supabase, profile) {
  return {
    memory: ["owner","operations"].includes(profile.role) ? {
      async list(){const {data,error}=await supabase.from("sculpy_operating_memory").select("*").order("updated_at",{ascending:false}).limit(100);if(error)throw Error("经营记忆读取失败，请检查管理员权限。");return data;},
      async manage({action,id,revision=null,content=null,supersedes=null}){const {data,error}=await supabase.rpc("sculpy_manage_memory",{p_action:action,p_id:id,p_revision:revision,p_content:content,p_supersedes:supersedes});if(error)throw Error("记忆操作未完成，可能权限不足或记录已变化，请重新读取核对。");return data;}
    } : null,
    mode: "cloud",
    transcribe: blob => transcribeAudio(blob, supabase),
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
