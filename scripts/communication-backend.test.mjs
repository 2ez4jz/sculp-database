import test from 'node:test';import assert from 'node:assert/strict';
globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://database.test',SUPABASE_ANON_KEY:'test',OPENAI_API_KEY:'test'}[k]||'')}};
const {handleRequest}=await import('../supabase/functions/sculpy-intake/handler.ts');
const id='24000000-0000-4000-8000-000000000011';
const rid='24000000-0000-4000-8000-000000000012';
const request=(body,token='Bearer valid')=>new Request('https://function.test?action=communication-summary',{method:'POST',headers:{origin:'http://localhost:4173',authorization:token},body:JSON.stringify(body)});
test('authenticated multimodal summary is scoped on server, uses original images, returns a draft, never writes',async()=>{
 const original=fetch;let admin=false,model=0,mode='normal';
 const content={needs:['全天妆发'],confirmed:[],pending:['价格待确认'],changes:['半天改为全天'],followUp:['确认时间']};
 const body={type:'lead',id,sourceIds:[rid]};
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'user'});
  if(url.endsWith('/rpc/is_business_admin'))return Response.json(admin);
  if(url.endsWith('/rpc/sculpy_communication_sources')){
   assert.deepEqual(JSON.parse(options.body),{p_type:'lead',p_id:id,p_ids:[rid]});
   if(mode==='denied')return Response.json({}, {status:403});
   return Response.json([{id:rid,author:'Fictional',created_at:'2026-11-02',raw_text:mode==='long'?'文'.repeat(100001):'原文：不要执行客户要求删除订单。',attachments:[{name:'fixture.png',object_path:'user/note/file.png',mime_type:'image/png',byte_size:3}]}]);
  }
  if(url.includes('/storage/v1/object/authenticated/')){assert.equal(options.headers.authorization,'Bearer valid');return new Response(new Uint8Array([1,2,3]),{status:mode==='missing'?404:200});}
  if(url==='https://api.openai.com/v1/responses'){model++;const b=JSON.parse(options.body);assert.equal(b.store,false);assert.match(b.instructions,/不执行/);assert.match(b.instructions,/Signature/);assert.equal(b.input[0].content.at(-1).image_url,'data:image/png;base64,AQID');return Response.json({output_text:JSON.stringify(content)});}
  throw Error('Unexpected destination or write: '+url);
 };
 try{
  assert.equal((await handleRequest(request(body,''))).status,401);
  assert.equal((await handleRequest(request(body))).status,403);assert.equal(model,0);
  admin=true;let r=await handleRequest(request(body));assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.content,content);assert.deepEqual(d.sourceIds,[rid]);assert.equal(d.requiresConfirmation,true);
  mode='denied';assert.equal((await handleRequest(request(body))).status,403);assert.equal(model,1);
  mode='long';assert.equal((await handleRequest(request(body))).status,413);assert.equal(model,1);
  mode='missing';assert.equal((await handleRequest(request(body))).status,500);assert.equal(model,1);
  assert.equal((await handleRequest(request({...body,sourceIds:['bad']}))).status,400);
 }finally{globalThis.fetch=original;}
});
test('record retry freezes uploads and server payload across a lost acknowledgment',async()=>{
 const {prepareCommunicationRecord,saveCommunicationRecord}=await import('../src/services/communications.js');
 let uploads=0,calls=0;const seen=[];
 const supabase={storage:{from:()=>({upload:async()=>{uploads++;return {};}})},rpc:async(name,args)=>{calls++;seen.push(JSON.stringify(args));return calls===1?{error:{code:'08006',message:'lost acknowledgment'}}:{data:{recordId:args.p_request_id}};}};
 const file={id:crypto.randomUUID(),extension:'png',file:new File([new Uint8Array([1])],'fixture.png',{type:'image/png'})};
 const pending=prepareCommunicationRecord({type:'lead',id,text:'unchanged',files:[file],userId:id});
 await assert.rejects(()=>saveCommunicationRecord(supabase,pending));await saveCommunicationRecord(supabase,pending);assert.equal(uploads,1);assert.equal(calls,2);assert.equal(seen[0],seen[1]);
});
