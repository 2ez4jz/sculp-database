import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {gmailHandler} from './handler.js';
const env=(k:string)=>Deno.env.get(k)||'';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),options);
// Reuses the current project's server-side OpenAI configuration; no browser key.
async function model({instructions,context,kind}:{instructions:string,context:unknown,kind:string}){
 if(!env('OPENAI_API_KEY'))throw Error('ai_not_configured');
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:'Bearer '+env('OPENAI_API_KEY'),'content-type':'application/json'},
  body:JSON.stringify({model:env('GMAIL_AI_MODEL')||env('SCULPY_CHAT_MODEL')||'gpt-6-luna',store:false,max_output_tokens:3000,instructions,input:JSON.stringify({kind,businessEmailData:context}),text:{format:{type:'json_object'}}}),signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('ai_unavailable');
 const r=await response.json(),text=r.output_text||r.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==='output_text')?.text;
 return JSON.parse(text);
}
Deno.serve(gmailHandler({admin,callerFor:(authorization:string)=>createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{...options,global:{headers:{Authorization:authorization}}}),env,model}));
