import {config} from '../config.js';
import {audioUpload} from '../../supabase/functions/sculpy-ai/audio-format.js';
import {intakeRpc} from './cloud-intake.js?v=cloud-write-20261022';
export const bucket='sculpy-communications';
export const summaryFields={needs:'客户当前需求',confirmed:'已确认事项',pending:'待确认事项',changes:'沟通变化',followUp:'后续跟进建议'};
export const communicationContext=(supabase,type,id,before=null)=>intakeRpc(supabase,'sculpy_communication_context',{p_type:type,p_id:id,p_before:before?.created_at||null,p_before_id:before?.id||null});
export const communicationCommand=(supabase,request)=>intakeRpc(supabase,'sculpy_communication_command',request);
export async function communicationAI(supabase,action,body) {
 const {data,error}=await supabase.auth.getSession();
 if(error||!data?.session)throw Error('请重新登录，输入内容仍保留。');
 const multipart=body instanceof FormData;
 const response=await fetch(`${config.supabaseUrl}/functions/v1/sculpy-intake?action=communication-${action}`,{method:'POST',headers:{apikey:config.supabasePublishableKey,authorization:`Bearer ${data.session.access_token}`,...(multipart?{}:{'content-type':'application/json'})},body:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(action==='summary'?180000:90000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'AI 服务暂时不可用，原文仍保留。');return result;
}
export async function prepareCommunicationFile(file) {
 if(!file.size)throw Error('文件为空，请重新选择。');
 if(file.type.startsWith('audio/')||file.type.startsWith('video/')) {
  const a=await audioUpload(file);if(a.blob.size>5000000)throw Error('单段语音请控制在5MB内。');
  return {id:crypto.randomUUID(),file:new File([a.blob],file.name||a.name,{type:a.mime}),extension:a.extension};
 }
 const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
 if(!ext||file.size>10000000)throw Error('截图支持10MB内的PNG、JPEG、WebP；请将HEIC转换为截图。');
 return {id:crypto.randomUUID(),file,extension:ext};
}
// This object survives uncertain acknowledgments. Never regenerate its UUID/payload on retry.
export function prepareCommunicationRecord({type,id,text,files,userId,kind='text'}) {
 const requestId=crypto.randomUUID();
 const attachments=files.map(a=>({id:a.id,path:`${userId}/${requestId}/${a.id}.${a.extension}`,name:a.file.name.slice(0,300),mime:a.file.type,size:a.file.size}));
 return {request:{p_request_id:requestId,p_action:'add_record',p_payload:{type,id,text,kind,attachments}},files,uploaded:new Set()};
}
export async function saveCommunicationRecord(supabase,pending) {
 const attachments=pending.request.p_payload.attachments;
 for(let i=0;i<attachments.length;i++){
  const a=attachments[i];if(pending.uploaded.has(a.id))continue;
  const {error}=await supabase.storage.from(bucket).upload(a.path,pending.files[i].file,{contentType:a.mime,upsert:false});
  // A retry of the same frozen bytes may find its completed upload. The RPC also verifies metadata.
  if(error&&String(error.statusCode)!=='409'){if(['400','401','403','413','415'].includes(String(error.statusCode)))error.code=['401','403'].includes(String(error.statusCode))?'42501':'22023';throw error;}
  pending.uploaded.add(a.id);
 }
 return communicationCommand(supabase,pending.request);
}
export async function communicationFile(supabase,path) {
 const {data,error}=await supabase.storage.from(bucket).download(path);if(error)throw error;return data;
}
