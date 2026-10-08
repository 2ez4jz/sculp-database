import { config } from '../config.js';
export async function identifyCloudIntake(supabase, rawText) {
 const {data,error}=await supabase.auth.getSession();
 if(error||!data.session)throw Error('请重新登录。');
 const res=await fetch(`${config.supabaseUrl}/functions/v1/sculpy-intake`,{method:'POST',headers:{'content-type':'application/json',apikey:config.supabasePublishableKey,authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({rawText}),signal:AbortSignal.timeout(90000)});
 const result=await res.json();if(!res.ok)throw Error(result.error||'识别失败，请重试。');return result;
}
export async function intakeRpc(supabase,name,args){
 const {data,error}=await supabase.rpc(name,args);
 if(error){const e=Error(error.message||'云端操作失败，请重试。');e.code=error.code;throw e;}
 if(!data)throw Error('云端未返回结果，请重试。');return data;
}
