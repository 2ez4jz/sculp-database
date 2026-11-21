import {OPENAI_API_KEY, ALLOWED_ORIGINS} from './config.ts';
import {cors, json, rateLimited} from './http.ts';
import {transcribe} from './transcribe.ts';

export async function handleRequest(request: Request) {
  const origin = request.headers.get('origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) return json('null', {error: 'Origin not allowed'}, 403);
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(origin)});
  if (request.method !== 'POST') return json(origin, {error: 'POST required'}, 405);
  if (new URL(request.url).searchParams.get('action') !== 'transcribe') {
    return json(origin, {error: '此接口已下线。'}, 410);
  }

  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json(origin, {error: '请先登录。'}, 401);
  const base = Deno.env.get('SUPABASE_URL');
  const headers = {apikey: Deno.env.get('SUPABASE_ANON_KEY') || '', authorization};
  try {
    const auth = await fetch(base + '/auth/v1/user', {headers, signal: AbortSignal.timeout(10000)});
    if (!auth.ok) return json(origin, {error: '无法验证当前登录。'}, auth.status >= 500 ? 503 : 401);
    const user = await auth.json();
    if (!user.id) return json(origin, {error: '登录无效。'}, 401);
    const profile = await fetch(base + '/rest/v1/profiles?select=id&active=is.true&id=eq.' + encodeURIComponent(user.id),
      {headers, signal: AbortSignal.timeout(10000)});
    if (!profile.ok) return json(origin, {error: '无法验证账户权限。'}, profile.status >= 500 ? 503 : 403);
    const records = await profile.json();
    if (!Array.isArray(records) || !records.some(row => row.id === user.id)) {
      return json(origin, {error: '需要有效的团队账户。'}, 403);
    }
    if (rateLimited(user.id)) return json(origin, {error: '请求较多，请稍后重试。'}, 429);
    if (!OPENAI_API_KEY) return json(origin, {error: '转写服务暂不可用。'}, 503);
    return await transcribe(request, origin);
  } catch {
    return json(origin, {error: '语音转写暂不可用，请稍后重试。'}, 503);
  }
}
