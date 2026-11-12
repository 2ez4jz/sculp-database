import test from 'node:test';import assert from 'node:assert/strict';
import {READ_SCOPE,seal,unseal,random,parseMail,inScope,syncPage,MailError,validateAnalysis,gmailTransport} from '../supabase/functions/sculpy-gmail/core.js';
import {gmailHandler} from '../supabase/functions/sculpy-gmail/handler.js';
const header=(from='Client <avery@example.test>')=>[{name:'From',value:from},{name:'To',value:'studio@example.test'},{name:'Subject',value:'Wedding inquiry'}];
const mail={id:'abc',threadId:'thread',internalDate:'1794500000000',labelIds:['INBOX'],snippet:'hello',payload:{mimeType:'multipart/mixed',headers:header(),parts:[{mimeType:'text/plain',body:{data:Buffer.from('婚礼需求 <script>bad</script>').toString('base64url')}},{filename:'quote.pdf',mimeType:'application/pdf',body:{attachmentId:'external'}}]}};
test('Gmail encryption authenticates ciphertext and never uses frontend-readable storage',async()=>{const key=random(),cipher=await seal({refresh_token:'fixture-secret'},key);assert(!cipher.includes('fixture-secret'));assert.deepEqual(await unseal(cipher,key),{refresh_token:'fixture-secret'});await assert.rejects(()=>unseal(cipher,random()));});
test('Gmail MIME handles UTF-8, filenames and trustworthy sent direction; draft/private mail stays outside scope',()=>{
 const m=parseMail(mail,['studio@example.test'],null);assert.equal(m.direction,'incoming');assert.match(m.body,/婚礼/);assert.equal(m.attachments[0].name,'quote.pdf');assert.equal(m.attachments[0].attachmentId,undefined);
 assert(inScope(mail,new Set(['avery@example.test'])));assert(!inScope({...mail,labelIds:['DRAFT']},new Set(['avery@example.test'])));assert(!inScope({...mail,payload:{headers:header('private@other.test')}},new Set(['avery@example.test'])));
 assert.equal(parseMail({...mail,labelIds:['SENT'],payload:{...mail.payload,headers:header('studio@example.test')}},['studio@example.test']).direction,'outgoing');
 assert.equal(parseMail({...mail,labelIds:['SENT']},['studio@example.test']).direction,'unknown');
});
test('incremental cursor never advances past unprocessed records; retries retain stable Gmail IDs',async()=>{
 const saved=[],contacts=[{email:'avery@example.test'}],account={email:'studio@example.test',cursor:'90'};
 const api={history:async()=>({historyId:'200',history:[{messagesAdded:Array.from({length:25},(_,n)=>({message:{id:'a'+n}}))}]}),metadata:async id=>({...mail,id}),message:async id=>({...mail,id})};
 let r=await syncPage({api,account,contacts,save:async m=>saved.push(...m)});assert.equal(r.cursor,'90');assert.equal(r.scan.queue.length,5);
 const again=await syncPage({api,account:{...account,scan:r.scan},contacts,save:async m=>saved.push(...m)});assert.equal(again.cursor,'200');assert.equal(saved.length,25);assert.equal(new Set(saved.map(m=>m.id)).size,25);
});
test('history 404 requests scoped full import; scope changes backfill historical mail without private body reads',async()=>{
 const contacts=[{email:'avery@example.test'}];let bodies=0;
 const api={history:async()=>{throw new MailError('cursor_missing',404);},profile:async()=>({historyId:'100'}),list:async q=>{assert(q.includes('from:"avery@example.test"'));return {messages:[{id:'abc'}]};},metadata:async()=>({...mail,payload:{headers:header('private@other.test')}}),message:async()=>{bodies++;return mail;}};
 let r=await syncPage({api,account:{email:'studio@example.test',cursor:'1'},contacts,save:async()=>{}});assert.equal(r.scan.mode,'full');
 r=await syncPage({api,account:{email:'studio@example.test',cursor:'1',scan:r.scan},contacts,save:async()=>{}});assert.equal(bodies,0);assert.equal(r.cursor,'100');
});
test('quota/network errors do not advance cursor; no known contacts means no mailbox-wide import',async()=>{
 await assert.rejects(()=>syncPage({api:{profile:async()=>{throw new MailError('rate_limit');}},account:{},contacts:[{email:'a@example.test'}],save:async()=>{assert.fail();}}),/rate_limit/);
 const r=await syncPage({api:{profile:()=>assert.fail()},account:{cursor:'100'},contacts:[],save:()=>assert.fail()});assert.equal(r.cursor,'100');
});
test('deleted, oversized and newly excluded mail cannot block a history batch or import a draft body',async()=>{
 const saved=[];const api={history:async()=>({historyId:'200',history:[{messagesAdded:['deleted','large','draft'].map(id=>({message:{id}}))}]}),metadata:async id=>({...mail,id}),message:async id=>{
  if(id==='deleted')throw new MailError('cursor_missing',404);if(id==='large')throw new MailError('message_too_large');return {...mail,id,labelIds:['DRAFT']};
 }};
 const r=await syncPage({api,account:{email:'studio@example.test',cursor:'100'},contacts:[{email:'avery@example.test'}],save:async m=>saved.push(...m)});
 assert.equal(r.cursor,'200');assert.equal(saved.length,1);assert.equal(saved[0].id,'large');assert.match(saved[0].body,/超出同步上限/);
});
test('transport has read-only Gmail endpoints and exposes only safe failure codes',async()=>{
 const requests=[];const api=gmailTransport({token:'fixture',fetcher:async(url,opts)=>{requests.push({url:String(url),opts});return Response.json({messages:[]});}});
 await api.list('from:"a@example.test"');await api.metadata('abc');assert(requests.every(r=>r.url.startsWith('https://gmail.googleapis.com/')&&!r.opts.method));
 const failed=gmailTransport({fetcher:async()=>Response.json({error:'invalid_grant',secret:'do-not-expose'},{status:400})});await assert.rejects(()=>failed.refresh('secret'),e=>e.message==='reauthorize');
});
test('AI schema rejects unsupported output and does not turn statements into business writes',()=>{
 assert.throws(()=>validateAnalysis({fields:{}},'summary'));assert.throws(()=>validateAnalysis({text:''},'reply'));assert.deepEqual(validateAnalysis({text:'Thanks, please confirm your date.',send:true},'reply'),{text:'Thanks, please confirm your date.'});
});
function handlerFixture(){const calls=[],states=new Map();let adminRole=true;
 const cfg={GMAIL_CLIENT_ID:'public-client',GMAIL_CLIENT_SECRET:'fixture-secret',GMAIL_TOKEN_KEY:random(),GMAIL_REDIRECT_URI:'https://project.test/functions/v1/sculpy-gmail?action=callback',GMAIL_APP_URL:'https://2ez4jz.github.io/sculp-database/',GMAIL_EXPECTED_EMAIL:'studio@example.test',SUPABASE_URL:'https://project.test',GMAIL_WORKER_KEY:'x'.repeat(40)};
 const h=gmailHandler({env:k=>cfg[k]||'',admin:{rpc:async(name,{p_action,p_data})=>{calls.push({p_action,p_data});if(p_action==='oauth_start')states.set(p_data.hash,{actor:p_data.actor,verifier:p_data.verifier});return {data:p_action==='oauth_consume'?states.get(p_data.hash):{}};}},callerFor:()=>({auth:{getUser:async()=>({data:{user:{id:'actor'}}})},rpc:async name=>({data:name==='is_business_admin'?adminRole:{accounts:[]}})}),model:()=>assert.fail('no model call'),fetcher:async()=>assert.fail('no live request')});
 return {h,calls,cfg,deny:()=>adminRole=false};
}
test('OAuth start returns readonly consent and S256 state binding, never verifier or tokens',async()=>{
 const x=handlerFixture();const r=await x.h(new Request('https://project.test/functions/v1/sculpy-gmail',{method:'POST',headers:{origin:'https://2ez4jz.github.io',authorization:'Bearer fixture'},body:JSON.stringify({action:'connect'})}));
 assert.equal(r.status,200);const out=await r.json(),url=new URL(out.url);assert.equal(url.searchParams.get('scope'),READ_SCOPE);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert(!JSON.stringify(out).includes('fixture-secret'));assert(!JSON.stringify(out).includes('refresh_token'));assert(x.calls[0].p_data.verifier);
});
test('Edge denies unauthorized origins, staff, worker and callback forgery without external calls',async()=>{
 const x=handlerFixture();let r=await x.h(new Request('https://project.test/functions/v1/sculpy-gmail',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}));assert.equal(r.status,403);
 r=await x.h(new Request('https://project.test/functions/v1/sculpy-gmail',{method:'POST',headers:{origin:'https://2ez4jz.github.io',authorization:'Bearer fixture'},body:JSON.stringify({action:'reply',message:'50000000-0000-4000-8000-000000000010',replyType:'send_now'})}));assert.equal(r.status,400);
 x.deny();r=await x.h(new Request('https://project.test/functions/v1/sculpy-gmail',{method:'POST',headers:{origin:'https://2ez4jz.github.io',authorization:'Bearer fixture'},body:'{}'}));assert.equal(r.status,403);
 r=await x.h(new Request('https://project.test/functions/v1/sculpy-gmail?action=worker',{method:'POST'}));assert.equal(r.status,401);
 r=await x.h(new Request('https://project.test/functions/v1/sculpy-gmail?action=callback&state=forged&code=secret'));assert.equal(r.status,400);assert(!JSON.stringify(await r.json()).includes('secret'));
});
test('OAuth callback exchanges on server, verifies mailbox/scope and stores encrypted tokens before fixed redirect',async()=>{
 const key=random(),state=random(),verifier=random(),calls=[];
 const cfg={GMAIL_CLIENT_ID:'client',GMAIL_CLIENT_SECRET:'secret',GMAIL_TOKEN_KEY:key,GMAIL_REDIRECT_URI:'https://project.test/functions/v1/sculpy-gmail?action=callback',GMAIL_APP_URL:'https://app.test/studio/',GMAIL_EXPECTED_EMAIL:'studio@example.test',SUPABASE_URL:'https://project.test'};
 const h=gmailHandler({env:k=>cfg[k]||'',callerFor:()=>assert.fail(),admin:{rpc:async(name,{p_action,p_data})=>{calls.push({p_action,p_data});return {data:p_action==='oauth_consume'?{actor:'owner',verifier:await seal({verifier},key)}:{connected:true}};}},model:()=>assert.fail(),fetcher:async(url,options)=>{
  if(String(url).includes('/token')){assert.equal(options.body.get('code_verifier'),verifier);return Response.json({access_token:'access-fixture',refresh_token:'refresh-fixture',expires_in:3600,scope:READ_SCOPE});}
  assert(String(url).endsWith('/profile'));return Response.json({emailAddress:'studio@example.test'});
 }});
 const r=await h(new Request('https://project.test/functions/v1/sculpy-gmail?action=callback&state='+state+'&code=fixture-code'));
 assert.equal(r.status,303);assert.equal(new URL(r.headers.get('location')).origin,'https://app.test');const stored=calls.find(c=>c.p_action==='connect').p_data.cipher;assert(!stored.includes('refresh-fixture'));assert.equal((await unseal(stored,key)).refresh_token,'refresh-fixture');
});
test('OAuth rejects and revokes broader Gmail grants or a different mailbox before storing credentials',async()=>{
 for(const wrongScope of ['send','full',false]){
  const key=random(),calls=[],state=random(),cfg={GMAIL_CLIENT_ID:'client',GMAIL_CLIENT_SECRET:'secret',GMAIL_TOKEN_KEY:key,GMAIL_REDIRECT_URI:'https://project.test/functions/v1/sculpy-gmail?action=callback',GMAIL_APP_URL:'https://app.test/',GMAIL_EXPECTED_EMAIL:'studio@example.test',SUPABASE_URL:'https://project.test'};
  const h=gmailHandler({env:k=>cfg[k]||'',callerFor:()=>assert.fail(),model:()=>assert.fail(),admin:{rpc:async(name,{p_action})=>{assert.equal(p_action,'oauth_consume');return {data:{actor:'owner',verifier:await seal({verifier:random()},key)}};}},fetcher:async url=>{
   calls.push(String(url));if(String(url).includes('/revoke'))return new Response(null,{status:200});
   if(String(url).includes('/token'))return Response.json({access_token:'access',refresh_token:'refresh',expires_in:3600,scope:READ_SCOPE+(wrongScope==='send'?' https://www.googleapis.com/auth/gmail.send':wrongScope==='full'?' https://mail.google.com/':'')});
   return Response.json({emailAddress:'personal@example.test'});
  }});
  const r=await h(new Request('https://project.test/functions/v1/sculpy-gmail?action=callback&state='+state+'&code=fixture'));
  assert.equal(r.status,400);assert.equal((await r.json()).error,wrongScope?'readonly_consent_required':'wrong_mailbox');assert(calls.some(x=>x.includes('/revoke')));
 }
});
