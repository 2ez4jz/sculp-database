import test from 'node:test';
import assert from 'node:assert/strict';

function storage() {
  const items=new Map();
  return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};
}

test('only an opted-in Supabase session resumes in a new window, refreshes, and clears on sign-out',async t=>{
  const origin='https://auth.example.test';
  const originalFetch=globalThis.fetch;
  const browser={sessionStorage:storage(),localStorage:storage()};
  const clients=new Set();
  const requests=[];
  const profile={id:'fixture-user',username:'sculp_fixture',display_name:'Fixture',role:'operations',active:true};
  const credentials={email:'sculp_fixture@example.test',password:'fictional-test-password'};
  const tabKey='sculp-auth-v1', deviceKey='sculp-auth-device-v1';
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload=()=>({
    access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:profile.id,exp:Math.floor(Date.now()/1000)+3600})}.ZmljdGlvbg`,
    refresh_token:'fixture-refresh-token',expires_in:3600,token_type:'bearer',user:{id:profile.id},
  });
  let unavailable=false;
  globalThis.SCULPY_CONFIG={supabaseUrl:origin,supabasePublishableKey:'fixture-key'};
  globalThis.window=browser;
  globalThis.fetch=async (request,options)=>{
    const url=new URL(typeof request==='string'?request:request.url??request);
    assert.equal(url.origin,origin);
    requests.push(url.pathname+url.search);
    if(url.pathname==='/auth/v1/token'){
      const body=JSON.parse(options.body);
      if(url.searchParams.get('grant_type')==='password') assert.deepEqual({email:body.email,password:body.password},credentials);
      else assert.equal(body.refresh_token,'fixture-refresh-token');
      return Response.json(payload());
    }
    if(url.pathname==='/auth/v1/user')return unavailable?Response.json({message:'Fixture unavailable'},{status:503}):Response.json({id:profile.id});
    if(url.pathname==='/rest/v1/profiles')return Response.json(profile);
    if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
    assert.fail(`Unexpected fixture route ${url.pathname}`);
  };
  t.after(async()=>{
    await Promise.all([...clients].map(client=>client.auth.stopAutoRefresh()));
    globalThis.fetch=originalFetch;
    delete globalThis.window;
    delete globalThis.SCULPY_CONFIG;
  });
  async function open(phase,choice) {
    const auth=await import(`../src/services/auth.js?${phase}`);
    const client=await auth.getAuthClient(choice);
    clients.add(client);
    return {client,verify:()=>auth.verifiedProfile(client)};
  }

  const tab=await open('temporary',{keepSignedIn:false});
  assert.equal((await tab.client.auth.signInWithPassword(credentials)).error,null);
  assert(browser.sessionStorage.getItem(tabKey));
  assert.equal(browser.localStorage.getItem(deviceKey),null);
  assert.equal((await (await open('reload')).client.auth.getSession()).data.session.user.id,profile.id);
  browser.sessionStorage=storage();
  assert.equal((await (await open('new-window')).client.auth.getSession()).data.session,null);

  const remembered=await open('opted-in',{keepSignedIn:true});
  assert.equal((await remembered.client.auth.signInWithPassword(credentials)).error,null);
  const saved=JSON.parse(browser.localStorage.getItem(deviceKey));
  assert.equal(saved.user.id,profile.id);
  assert(!JSON.stringify(saved).includes(credentials.password));
  assert.equal(browser.sessionStorage.getItem(tabKey),null);
  saved.expires_at=Math.floor(Date.now()/1000)-1;
  browser.localStorage.setItem(deviceKey,JSON.stringify(saved));

  browser.sessionStorage=storage();
  const fresh=await open('reopened');
  assert.equal((await fresh.client.auth.getSession()).data.session.user.id,profile.id);
  assert(requests.includes('/auth/v1/token?grant_type=refresh_token'));
  assert.deepEqual(await fresh.verify(),profile);
  unavailable=true;
  await assert.rejects(fresh.verify, error=>error.temporary===true);
  assert(browser.localStorage.getItem(deviceKey));
  unavailable=false;
  assert.equal((await fresh.client.auth.signOut({scope:'local'})).error,null);
  assert.equal(browser.localStorage.getItem(deviceKey),null);
  assert.equal((await (await open('after-sign-out')).client.auth.getSession()).data.session,null);
});
