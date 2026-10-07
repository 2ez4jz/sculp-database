import { saveState } from "./storage.js";
// Demo writes are atomic: memory state changes only after storage succeeds.
export function createDemoMemoryRepository({
  getState,
  setState,
  storage = saveState,
}) {
  return {
    mode: "demo",
    async save(batch) {
      const state = getState();
      const existing = (state.memories || []).find((x) => x.id === batch.id);
      if (existing) return existing;
      const next = { ...state, memories: [...(state.memories || []), batch] };
      if (!storage(next))
        throw Error(
          "浏览器保存失败，内容仍保留在面板中。请释放存储空间后重试。",
        );
      setState(next);
      return batch;
    },
  };
}
// Integration adapter: requires an authenticated Supabase client, never a service key.
// The production app must load real UUID-backed records before mounting the panel.
export function createCloudMemoryRepository({ supabase }) {
  return {
    mode: "cloud",
    async save(batch) {
      if (!supabase) throw Error("云端尚未连接，未保存任何数据。");
      const { data: session, error: authError } =
        await supabase.auth.getSession();
      if (authError || !session?.session) throw Error("请先登录再保存。");
      const { data, error } = await supabase.rpc("save_context_memory", {
        p_request_id: batch.id,
        p_entity_type: batch.entityType,
        p_entity_id: batch.entityId,
        p_raw_text: batch.rawText,
        p_input_type: batch.inputType,
        p_items: batch.items,
      });
      if (error) throw Error(error.message || "云端保存失败，请重试。");
      if (!data?.id) throw Error("云端未返回保存确认，请重试。");
      return data;
    },
  };
}
