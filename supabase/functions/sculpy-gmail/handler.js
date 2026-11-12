import {READ_SCOPE,random,digest,seal,unseal,gmailTransport,syncPage,MailError,validateAnalysis,emailAiInstructions,addresses} from './core.js';
import {readBody} from '../sculpy-notifications/handler.js';
export function gmailHandler({admin,callerFor,env,fetcher=fetch,model}){
 const server=async(action,data={})=>{const r=await admin.rpc('sculpy_gmail_server',{p_action:action,p_data:data});if(r.error)throw new MailError('database_unavailable');return r.data;};
 const config=()=>{
  for(const k of ['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_TOKEN_KEY','GMAIL_REDIRECT_URI','GMAIL_APP_URL','GMAIL_EXPECTED_EMAIL'])if(!env(k))throw new MailError('setup_required',409);
  if(!/^[A-Za-z0-9_-]{43}$/.test(env('GMAIL_TOKEN_KEY')))throw new MailError('setup_required',409);
  const redirect=new URL(env('GMAIL_REDIRECT_URI')),app=new URL(env('GMAIL_APP_URL'));
  if(redirect.protocol!=='https:'||app.protocol!=='https:'||redirect.origin!==new URL(env('SUPABASE_URL')).origin||redirect.pathname!=='/functions/v1/sculpy-gmail'||redirect.search!=='?action=callback'||app.username||app.password)throw new MailError('setup_required',409);
  return {clientId:env('GMAIL_CLIENT_ID'),clientSecret:env('GMAIL_CLIENT_SECRET'),redirectUri:redirect.href};
 };
 const transport=token=>gmailTransport({...config(),token,fetcher});
 const safeCode=e=>e instanceof MailError?e.code:'operation_failed';
 async function analyze(message,actor,kind,replyType){
  const context=await server('ai_context',{message,actor});if(!context)throw new MailError('ai_not_enabled',409);
  if(kind==='reply')context.requestedDraft=replyType||'general';
  const content=validateAnalysis(await model({instructions:emailAiInstructions(kind),context,kind}),kind);
  await server('ai_store',{message,actor,kind,content});return {content};
 }
 async function sync(force=false,full=false){
  config();const a=await server('claim',{force});if(!a)return {busyOrNotDue:true};
  const data={account:a.id,lease:a.lease};
  try{
   const secrets=await unseal(a.token_cipher,env('GMAIL_TOKEN_KEY'));
   let access=secrets.access_token;
   if(!access||secrets.expires_at<Date.now()+60000){
    const refreshed=await transport().refresh(secrets.refresh_token);access=refreshed.access_token;
    await server('token',{...data,cipher:await seal({...secrets,...refreshed,refresh_token:refreshed.refresh_token||secrets.refresh_token,expires_at:Date.now()+refreshed.expires_in*1000},env('GMAIL_TOKEN_KEY'))});
   }
   const contacts=(await server('contacts')).filter(x=>addresses(x.email).length===1&&addresses(x.email)[0]===x.email);
   const account={...a,...(full?{cursor:null,scan:null}:{}),aliases:env('GMAIL_ALIASES').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)};
   const result=await syncPage({api:transport(access),account,contacts,save:messages=>server('ingest',{...data,messages})});
   await server('finish',{...data,...result});
   // One opt-in summary per tick. A model failure cannot roll back mail or cursor.
   if(env('GMAIL_AUTOMATIC_AI')==='true')try{const next=await server('ai_pending');if(next)await analyze(next.message,next.actor,'summary');}catch{/* no sensitive logs */}
   return {synced:result.count,continuing:Boolean(result.scan?.mode==='full'||result.scan?.page||result.scan?.queue?.length)};
  }catch(e){try{await server('fail',{...data,code:safeCode(e)});}catch{}throw e;}
 }
 return async request=>{
  const url=new URL(request.url),origin=request.headers.get('origin')||'';
  const origins=new Set((env('GMAIL_ALLOWED_ORIGINS')||'https://2ez4jz.github.io').split(',').map(x=>x.trim()));
  const headers={'content-type':'application/json','cache-control':'no-store','vary':'Origin','access-control-allow-origin':origins.has(origin)?origin:'null','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,apikey,content-type,x-client-info'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try{
   if(request.method==='GET'&&url.searchParams.get('action')==='callback'){
    config();const state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(state)||code.length>4096)throw new MailError('oauth_state',400);
    const stored=await server('oauth_consume',{hash:await digest(state)});
    if(!code||url.searchParams.has('error'))throw new MailError('oauth_denied',400);
    const {verifier}=await unseal(stored.verifier,env('GMAIL_TOKEN_KEY'));
    const token=await transport().exchange(code,verifier);
    if(!token.refresh_token||!token.access_token||!String(token.scope||'').split(' ').includes(READ_SCOPE)||String(token.scope).split(' ').some(x=>x!==READ_SCOPE)){
     try{if(token.refresh_token||token.access_token)await transport().revoke(token.refresh_token||token.access_token);}catch{}
     throw new MailError('readonly_consent_required',400);
    }
    const profile=await transport(token.access_token).profile();
    if(profile.emailAddress.toLowerCase()!==env('GMAIL_EXPECTED_EMAIL').trim().toLowerCase()){
     try{await transport().revoke(token.refresh_token);}catch{}throw new MailError('wrong_mailbox',400);
    }
    await server('connect',{email:profile.emailAddress.toLowerCase(),actor:stored.actor,label:env('GMAIL_BUSINESS_LABEL_ID'),cipher:await seal({...token,expires_at:Date.now()+token.expires_in*1000},env('GMAIL_TOKEN_KEY'))});
    const target=new URL(env('GMAIL_APP_URL'));target.searchParams.set('gmail','connected');
    return new Response(null,{status:303,headers:{location:target.href,'cache-control':'no-store','referrer-policy':'no-referrer'}});
   }
   if(url.searchParams.get('action')==='worker'){
    const expected=env('GMAIL_WORKER_KEY');
    if(request.method!=='POST'||!expected||expected.length<32||request.headers.get('x-gmail-worker-key')!==expected)return reply({error:'unauthorized'},401);
    return reply(await sync(false));
   }
   if(!origins.has(origin))return reply({error:'origin_denied'},403);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(request.method!=='POST')return reply({error:'method'},405);
   const auth=request.headers.get('authorization')||'';if(!/^Bearer\s+\S+$/i.test(auth))return reply({error:'sign_in_required'},401);
   const caller=callerFor(auth),user=await caller.auth.getUser();
   if(user.error||!user.data?.user)return reply({error:'sign_in_required'},401);
   const role=await caller.rpc('is_business_admin',{});if(role.error||role.data!==true)return reply({error:'permission_denied'},403);
   const actor=user.data.user.id,{action,message,replyType}=await readBody(request);
   if(action==='state'){let configured=true;try{config();}catch{configured=false;}const r=await caller.rpc('sculpy_gmail_read',{});if(r.error)throw new MailError('migration_required',409);return reply({configured,...r.data});}
   if(action==='connect'){
    config();const state=random(),verifier=random();
    await server('oauth_start',{actor,hash:await digest(state),verifier:await seal({verifier},env('GMAIL_TOKEN_KEY'))});
    const consent=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for(const [k,v]of Object.entries({client_id:env('GMAIL_CLIENT_ID'),redirect_uri:env('GMAIL_REDIRECT_URI'),response_type:'code',scope:READ_SCOPE,access_type:'offline',prompt:'consent',include_granted_scopes:'false',state,code_challenge:await digest(verifier),code_challenge_method:'S256'}))consent.searchParams.set(k,v);
    return reply({url:consent.href});
   }
   if(action==='disconnect'){
    const old=await server('disconnect',{actor});let revoked=true;
    if(old?.cipher)try{const s=await unseal(old.cipher,env('GMAIL_TOKEN_KEY'));await transport().revoke(s.refresh_token);}catch{revoked=false;}
    return reply({disconnected:true,revoked});
   }
   if(action==='sync'||action==='import')return reply(await sync(true,action==='import'));
   if(action==='summary'||action==='reply'){
    if(!/^[0-9a-f-]{36}$/i.test(message||''))return reply({error:'invalid_message'},400);
    if(action==='reply'&&replyType&&!['general','initial_enquiry','pricing','request_details','quote_followup','unavailable','deposit','pre_service','thank_you'].includes(replyType))return reply({error:'invalid_draft_type'},400);
    return reply(await analyze(message,actor,action,replyType));
   }
   return reply({error:'unknown_action'},400);
  }catch(e){return reply({error:safeCode(e)},e instanceof MailError&&e.status>=400&&e.status<600?e.status:503);}
 };
}
