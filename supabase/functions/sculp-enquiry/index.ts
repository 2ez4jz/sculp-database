import {makeEnquiryHandler} from './handler.js';
Deno.serve(makeEnquiryHandler(async(payload:unknown,bucket:string)=>{
 const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/sculpy_submit_website_enquiry',{
  method:'POST',headers:{apikey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,authorization:'Bearer '+Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json'},
  body:JSON.stringify({p_payload:payload,p_bucket:bucket}),signal:AbortSignal.timeout(10000)
 });
 const result=await response.json();if(!response.ok)throw Object.assign(Error('Enquiry write failed'),{code:result.code});return result;
}));
