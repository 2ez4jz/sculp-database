import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno = {env: {get: key => ({OPENAI_API_KEY:'fixture', SUPABASE_URL:'https://team.test', SUPABASE_ANON_KEY:'public-fixture'})[key]}};
const {handleRequest} = await import('../supabase/functions/sculpy-ai/handler.ts');
const origin = 'http://localhost:4173';
const url = 'https://edge.test/?action=transcribe';
test('retired AI actions and unsigned transcription never call the provider', async () => {
  const prior = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('Unexpected external call'); };
  try {
    for (const action of ['extract', 'search', 'image']) {
      assert.equal((await handleRequest(new Request('https://edge.test/?action='+action,{method:'POST',headers:{origin}}))).status,410);
    }
    assert.equal((await handleRequest(new Request(url,{method:'POST',headers:{origin}}))).status,401);
    assert.equal((await handleRequest(new Request(url,{method:'OPTIONS',headers:{origin}}))).status,204);
    assert.equal((await handleRequest(new Request(url,{headers:{origin}}))).status,405);
    assert.equal((await handleRequest(new Request(url))).status,403);
    assert.equal(calls,0);
  } finally { globalThis.fetch = prior; }
});
test('voice requires an active team profile and forwards one bounded recording', async () => {
  const prior = globalThis.fetch;
  let active=false,valid=true,uploads=0;
  const headers = {origin,authorization:'Bearer fake-session'};
  globalThis.fetch = async (endpoint, opts) => {
    if (endpoint.startsWith('https://team.test')) assert.equal(opts.headers.authorization, headers.authorization);
    if (endpoint.endsWith('/auth/v1/user')) return valid ? Response.json({id:'fictional-user'}) : new Response(null,{status:401});
    if (endpoint.includes('/rest/v1/profiles?')) return Response.json(active ? [{id:'fictional-user'}] : []);
    assert(endpoint.endsWith('/audio/transcriptions'));
    uploads++;
    return Response.json({text:'fixture'});
  };
  try {
    const send = async (extra={}) => {
      const form = new FormData();form.append('audio',new File([new Uint8Array([26,69,223,163,0])],'clip.webm',{type:'audio/webm'}));
      return handleRequest(new Request(url,{method:'POST',headers:{...headers,...extra},body:form}));
    };
    assert.equal((await send()).status,403);
    valid=false;assert.equal((await send()).status,401);
    valid=true;active=true;
    assert.equal((await send({'content-length':'8000000'})).status,413);
    assert.equal(uploads,0);
    assert.equal((await (await send()).json()).text,'fixture');
    assert.equal(uploads,1);
  } finally {globalThis.fetch=prior;}
});
