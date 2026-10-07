// Setup type definitions for built-in Supabase Runtime APIs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get('SCULPY_ALLOWED_ORIGINS') ||
    'https://2ez4jz.github.io,http://localhost:4173,http://127.0.0.1:4173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const requestLog = new Map<string, number[]>();

function cors(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

function json(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'content-type': 'application/json; charset=utf-8' },
  });
}

function getOutputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('OpenAI response did not contain output text.');
}

function rateLimited(request: Request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter((time) => now - time < 60_000);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > 20;
}

async function openAIJson(instructions: string, input: string, name: string, schema: object) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-6-luna',
      store: false,
      instructions,
      input,
      text: { format: { type: 'json_schema', name, strict: true, schema } },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI request failed (${response.status}).`);
  return JSON.parse(getOutputText(payload));
}

async function transcribe(request: Request, origin: string) {
  const incoming = await request.formData();
  const audio = incoming.get('audio');
  if (!(audio instanceof File)) return json(origin, { error: 'Audio file is required.' }, 400);
  if (!audio.size || audio.size > 5_000_000) return json(origin, { error: 'Audio must be between 1 byte and 5 MB.' }, 400);

  const form = new FormData();
  form.append('file', audio, audio.name || 'sculpy.webm');
  form.append('model', 'gpt-transcribe');
  form.append(
    'prompt',
    'SCULP Studio premium bridal beauty work note. Names may include Sculpy, Miranda, Mira, Yuki, Angelina, Elaine, Emily, Michelle, Giselle and Jz. Common terms include bridal trial, wedding-day styling, half-day, full-day, makeup, hairstyling, touch-up, ceremony, reception, photographer, planner and venue. Preserve Chinese and English code-switching, names, prices, dates and times accurately. Do not summarize; return the complete spoken transcript.',
  );

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Transcription failed (${response.status}).`);
  return json(origin, { text: payload.text || '', provider: 'openai', requestId: response.headers.get('x-request-id') });
}

async function extract(request: Request, origin: string) {
  const body = await request.json();
  const rawText = String(body?.rawText || '').trim();
  if (!rawText || rawText.length > 4_000) return json(origin, { error: 'Work note must be 1–4,000 characters.' }, 400);

  const result = await openAIJson(
    'You are Sculpy, an internal assistant for a premium bridal beauty studio. Convert an employee work note into a concise, factual draft. Never invent facts. Keep client feedback distinct from follow-up opportunities. Reply in Simplified Chinese except proper names. Confidence is 0 to 1.',
    JSON.stringify({ rawText, bookingId: body?.bookingId || null, pageContext: body?.pageContext || {} }),
    'sculpy_work_memory',
    {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        preferences: { type: 'array', items: { type: 'string' } },
        opportunities: { type: 'array', items: { type: 'string' } },
        partners: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['name', 'type', 'confidence'],
            additionalProperties: false,
          },
        },
        confidence: { type: 'number' },
      },
      required: ['summary', 'preferences', 'opportunities', 'partners', 'confidence'],
      additionalProperties: false,
    },
  );
  return json(origin, { ...result, provider: 'openai' });
}

async function search(request: Request, origin: string) {
  const body = await request.json();
  const query = String(body?.query || '').trim();
  if (!query || query.length > 300) return json(origin, { error: 'Search query must be 1–300 characters.' }, 400);
  const catalog = body?.catalog || {};
  const safeCatalog = {
    bookings: Array.isArray(catalog.bookings) ? catalog.bookings.slice(0, 80) : [],
    artists: Array.isArray(catalog.artists) ? catalog.artists.slice(0, 30) : [],
    partners: Array.isArray(catalog.partners) ? catalog.partners.slice(0, 50) : [],
    notes: Array.isArray(catalog.notes) ? catalog.notes.slice(0, 80) : [],
  };

  const result = await openAIJson(
    'You are Sculpy, an internal search and decision assistant for SCULP Studio. Answer only from the supplied fictional demo catalog. Be concise and useful. If evidence is insufficient, say so. Return at most 6 results and use only IDs and entity kinds present in the catalog. Reply in Simplified Chinese except proper names.',
    JSON.stringify({ query, catalog: safeCatalog }),
    'sculpy_database_search',
    {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        results: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['booking', 'artist', 'partner'] },
              id: { type: 'string' },
              label: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['kind', 'id', 'label', 'reason'],
            additionalProperties: false,
          },
        },
        evidenceIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['answer', 'results', 'evidenceIds'],
      additionalProperties: false,
    },
  );
  const allowed = new Map<string, Set<string>>([
    ['booking', new Set(safeCatalog.bookings.map((item: any) => String(item?.id || '')).filter(Boolean))],
    ['artist', new Set(safeCatalog.artists.map((item: any) => String(item?.id || '')).filter(Boolean))],
    ['partner', new Set(safeCatalog.partners.map((item: any) => String(item?.id || '')).filter(Boolean))],
  ]);
  const results = (result.results || []).filter((item: any) => allowed.get(item.kind)?.has(String(item.id)));
  const evidenceIds = (result.evidenceIds || []).filter((id: any) =>
    [...allowed.values()].some((ids) => ids.has(String(id))),
  );
  return json(origin, { ...result, results, evidenceIds, provider: 'openai' });
}

const handleRequest = async (request: Request) => {
  const origin = request.headers.get('origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) return json(origin || 'null', { error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== 'POST') return json(origin, { error: 'Method not allowed.' }, 405);
  if (!OPENAI_API_KEY) return json(origin, { error: 'Server AI configuration is missing.' }, 500);
  if (rateLimited(request)) return json(origin, { error: 'Too many requests. Please wait one minute.' }, 429);

  try {
    const action = new URL(request.url).searchParams.get('action');
    if (action === 'transcribe') return await transcribe(request, origin);
    if (action === 'extract') return await extract(request, origin);
    if (action === 'search') return await search(request, origin);
    return json(origin, { error: 'Unknown action.' }, 404);
  } catch (error) {
    console.error(error);
    return json(origin, { error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
};

export default {
  fetch: withSupabase(
    {
      auth: 'none',
      // This function has a strict origin allow-list below.
      cors: 'disabled',
    },
    async (request) => handleRequest(request),
  ),
};
