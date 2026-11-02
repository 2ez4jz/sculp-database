import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import webpush from 'web-push';
import {notificationHandler,validEndpoint,validateSubscription,deliveryOutcome} from '../supabase/functions/sculpy-notifications/handler.js';
import {createPushTransport} from '../supabase/functions/sculpy-notifications/transport.js';
const uid='35000000-0000-4000-8000-000000000001',sid='35000000-0000-4000-8000-000000000101',nid='35000000-0000-4000-8000-000000000201';
const token='signed.'+Buffer.from(JSON.stringify({sub:uid,session_id:sid})).toString('base64url')+'.validated-by-getUser';
const subscription=()=>({endpoint:'https://fcm.googleapis.com/fcm/send/FICTIONAL-ONLY',keys:{p256dh:webpush.generateVAPIDKeys().publicKey,auth:randomBytes(16).toString('base64url')}});
const req=(body,headers={},url='https://example.test/sculpy-notifications')=>new Request(url,{method:'POST',headers:{origin:'https://2ez4jz.github.io',authorization:'Bearer '+token,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
function handler(extra={}){
 const calls=[];const h=notificationHandler({allowedOrigins:new Set(['https://2ez4jz.github.io']),callerFor:()=>({auth:{getUser:async()=>({data:{user:{id:uid}}})}}),
  admin:{rpc:async(name,args)=>{calls.push({name,args});if(name==='sculpy_push_api')return {data:{preferences:{enabled:false},publicKey:null}};return {data:{publicKey:'public-only',privateKey:'NEVER-EXPOSE'}};}},generateKeys:()=>({}),sendPush:async()=>({status:201}),...extra});return {h,calls};
}
test('push API: validated actor/session, strict actions and origins, no implicit opt-in or secret response',async()=>{
 const {h,calls}=handler();let r=await h(req({action:'state'}));assert.equal(r.status,200);assert(!await r.text().then(x=>x.includes('NEVER-EXPOSE')));
 assert.equal(calls[0].args.p_actor,uid);assert.equal(calls[0].args.p_session,sid);assert.equal(calls[0].args.p_action,'state');
 assert.equal((await h(req({action:'state',actor:'someone-else'}))).status,400);
 assert.equal((await h(req({action:'internal_send'}))).status,400);
 assert.equal((await h(req({action:'state'},{origin:'https://evil.test'}))).status,403);
 assert.equal((await h(req({action:'state'},{authorization:''}))).status,401);
 const bad=handler({callerFor:()=>({auth:{getUser:async()=>({error:{},data:{user:null}})}})});assert.equal((await bad.h(req({action:'state'}))).status,401);assert.equal(bad.calls.length,0);
 assert.equal((await h(req({action:'state',data:{x:'x'.repeat(9000)}}))).status,413);
 assert.equal((await h(req({action:'open',data:{id:'bad'}}))).status,400);
 const denied=handler({admin:{rpc:async()=>({error:{code:'42501',message:'private server details'}})}});const response=await denied.h(req({action:'state'}));assert.equal(response.status,403);assert(!await response.text().then(x=>x.includes('private server')));
});
test('push subscriptions: vendor-only HTTPS and real P-256 key validation',async()=>{
 for(const endpoint of ['http://127.0.0.1/private','https://fcm.googleapis.com.evil.test/a','https://fcm.googleapis.com@evil.test/a','https://fcm.googleapis.com/a#x','https://evil.test/a'])assert(!validEndpoint(endpoint));
 assert(validEndpoint('https://web.push.apple.com/FICTIONAL'));assert(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/FICTIONAL'));
 await validateSubscription(subscription());await assert.rejects(()=>validateSubscription({endpoint:'https://fcm.googleapis.com/a',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}}));
 const {h}=handler();assert.equal((await h(req({action:'subscribe',data:{subscription:{endpoint:'https://evil.test/a'}}}))).status,400);
});
test('push transport: RFC encryption in the shared Edge adapter, stable Topic, no plaintext or redirects',async()=>{
 let captured;const adapter=createPushTransport(webpush,async(url,options)=>{captured={url,options};return new Response('',{status:201,headers:{'retry-after':'30'}});});
 const keys=adapter.generateKeys(),payload={id:nid,kind:'new_enquiry',title:'收到新的婚礼询盘',body:'请打开 Sculpy 查看。'};
 await adapter.sendPush({subscription:subscription(),payload,keys,topic:nid.replace(/-/g,'')});
 assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers['Content-Encoding'],'aes128gcm');assert.equal(captured.options.headers.Topic,nid.replace(/-/g,''));
 assert(!Buffer.from(captured.options.body).includes(Buffer.from(payload.title)));assert(captured.options.headers.Authorization.startsWith('vapid '));
 assert.equal(deliveryOutcome(201).result,'accepted');assert.equal(deliveryOutcome(410).result,'gone');assert.equal(deliveryOutcome(429,'99999').retryAfter,3600);assert.equal(deliveryOutcome(503).result,'retry');assert.equal(deliveryOutcome(401).result,'failed');
});
test('push worker: private worker credential, immediate eligibility recheck and generic payload allowlist',async()=>{
 const calls=[],sent=[],key='a'.repeat(64),keys=webpush.generateVAPIDKeys();let claimed=false;
 const h=handler({admin:{rpc:async(name,args)=>{calls.push(args);const a=args.p_action;
  if(a==='authorize_worker')return {data:{authorized:args.p_data.key===key}};
  if(a==='identity')return {data:keys};if(a==='tick')return {data:{enabled:true}};
  if(a==='claim'){claimed=true;return {data:{items:[{id:uid,lease:sid},{id:sid,lease:uid}]}};}
  if(a==='prepare')return {data:args.p_data.id===uid?{notification:{id:nid,kind:'new_enquiry',title:'PRIVATE NAME AND MONEY',customer:'SECRET'},subscription:subscription()}:{} };
  if(a==='finish')return {data:{ok:true}};throw Error(a);
 }},sendPush:async x=>{sent.push(x);return {status:201};}}).h;
 const url='https://example.test/sculpy-notifications?worker=1';
 assert.equal((await h(req({}, {},url))).status,401);assert(!claimed);
 const response=await h(req({}, {'x-sculpy-worker-key':key},url));assert.equal(response.status,200);assert.equal(sent.length,1);
 assert.deepEqual(Object.keys(sent[0].payload).sort(),['body','id','kind','title']);assert.equal(sent[0].payload.title,'收到新的官网询盘');assert(!JSON.stringify(sent[0].payload).includes('SECRET'));
 assert(calls.findIndex(x=>x.p_action==='prepare')<calls.findIndex(x=>x.p_action==='finish'));assert.equal(calls.filter(x=>x.p_action==='finish').length,1);
});
