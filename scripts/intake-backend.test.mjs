import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://database.test',SUPABASE_ANON_KEY:'test-key',OPENAI_API_KEY:'test-key'}[k]||'')}};
const {handleRequest}=await import('../supabase/functions/sculpy-intake/handler.ts');
const request=(body,token='Bearer test')=>new Request('https://function.test',{method:'POST',headers:{origin:'http://localhost:4173',authorization:token},body:JSON.stringify(body)});
test('cloud AI endpoint: unauthenticated/inactive/staff blocked before model; read-only extraction contract',async()=>{
 const original=globalThis.fetch;let modelCalls=0,admin=false;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'test-user'});
  if(url.endsWith('/rpc/is_business_admin'))return Response.json(admin);
  if(url==='https://api.openai.com/v1/responses'){
   modelCalls++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.match(body.instructions,/年份未明确则留空/);assert.match(body.instructions,/联系过/);
   return Response.json({output_text:JSON.stringify({isNewBooking:true,draft:{clientName:'Amy',date:'',budget:'1800'},warnings:['请补齐年份']})});
  }throw Error('Unexpected write or destination: '+url);
 };
 try{
  assert.equal((await handleRequest(request({rawText:'Amy'},''))).status,401);
  assert.equal((await handleRequest(request({rawText:'Amy'}))).status,403);assert.equal(modelCalls,0);
  admin=true;assert.equal((await handleRequest(request({rawText:''}))).status,400);
  const result=await handleRequest(request({rawText:'我是Amy，11月15日结婚，联系过Miranda，预算1800。'}));assert.equal(result.status,200);assert.equal((await result.json()).draft.date,'');assert.equal(modelCalls,1);
 }finally{globalThis.fetch=original}
});

import {cloudWriteFailure,intakeRpc} from '../src/services/cloud-intake.js';

test('lost acknowledgments retain replay identity even when message mentions business fields',async()=>{
 for(const error of [Error('客户日期保存后网络断开'),{code:'08006'},{code:'57014'},{code:'PGRST000'},{code:'XX000'}])
  assert.equal(cloudWriteFailure(error),'uncertain');
 for(const code of ['22023','23505','P0001'])assert.equal(cloudWriteFailure({code}),'rejected');
 for(const code of ['40001','42501'])assert.equal(cloudWriteFailure({code}),'refresh');
});

test('RPC propagates database conflict codes and does not invent an acknowledgment',async()=>{
 await assert.rejects(()=>intakeRpc({rpc:async()=>({error:{code:'40001',message:'Changed elsewhere'}})},'command',{}),e=>e.code==='40001');
 await assert.rejects(()=>intakeRpc({rpc:async()=>({data:null})},'command',{}),/未返回结果/);
});
