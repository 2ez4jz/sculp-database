import { config } from "../config.js";
const tabSessionKey = "sculp-auth-v1";
const deviceSessionKey = "sculp-auth-device-v1";
const clients = new Map();

function browserStorage(keepSignedIn) {
  try {
    return keepSignedIn ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function hasSession(storage, key) {
  try {
    return Boolean(storage?.getItem(key));
  } catch {
    return false;
  }
}

export function authConfigured() {
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}
export async function getAuthClient({ keepSignedIn } = {}) {
  if (!authConfigured()) throw new Error("登录服务尚未配置，请联系 Jz。");
  const tabStorage = browserStorage(false);
  const deviceStorage = browserStorage(true);
  // Use separate Supabase keys so a tab-only session keeps its own auth events.
  const remember = keepSignedIn ?? (!hasSession(tabStorage,tabSessionKey) && hasSession(deviceStorage,deviceSessionKey));
  const storage = remember ? deviceStorage : tabStorage;
  const storageKey = remember ? deviceSessionKey : tabSessionKey;
  if (!storage) throw new Error(remember ? "此浏览器无法保持登录。取消勾选后可重试。" : "浏览器无法保存登录会话。");
  if (!clients.has(storageKey)) {
    const client = import("../vendor/supabase.js").then(({ createClient }) =>
      createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage, storageKey },
      }),
    ).catch(error => {
      clients.delete(storageKey);
      throw error;
    });
    clients.set(storageKey,client);
  }
  return clients.get(storageKey);
}

function verifyConnection(error, status = error?.status) {
  if (error && (error.name === "AuthRetryableFetchError" || status === 0 || status === 429 || status >= 500)) {
    throw Object.assign(new Error("暂时无法验证登录，请稍后刷新重试。"), { temporary: true });
  }
}

export async function verifiedProfile(supabase) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  verifyConnection(error);
  if (error || !user) throw new Error("登录已失效，请重新登录。");
  const { data, error: profileError, status } = await supabase
    .from("profiles")
    .select("id,username,display_name,role,active,welcome_message")
    .eq("id", user.id)
    .single();
  verifyConnection(profileError,status);
  if (profileError || !data?.active)
    throw new Error("此账户尚未开通或已停用，请联系 Jz。");
  return data;
}
