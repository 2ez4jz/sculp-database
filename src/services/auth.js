import { config } from "../config.js";
let client;
export function authConfigured() {
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}
export async function getAuthClient() {
  if (!authConfigured()) throw new Error("登录服务尚未配置，请联系 Jz。");
  if (!client) {
    const { createClient } = await import("../vendor/supabase.js");
    client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: sessionStorage,
        storageKey: "sculp-auth-v1",
      },
    });
  }
  return client;
}
export async function verifiedProfile(supabase) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("登录已失效，请重新登录。");
  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("id,display_name,role,active")
    .eq("id", user.id)
    .single();
  if (profileError || !data?.active)
    throw new Error("此账户尚未开通或已停用，请联系 Jz。");
  return data;
}
