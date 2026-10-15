import {compactDemoReport} from '../../supabase/functions/sculpy-chat/demo-report.js';
// UI snapshots stay in local history. Send only conversational context and the
// small report scopes needed for follow-ups, retaining the newest turns first.
export function boundedDemoRequest(body){
 const turns=(body.turns||[]).slice(-12).map(t=>({id:t.id,user:t.user,answer:t.answer,sourceIds:t.sourceIds||[],...(t.demoReportSources?.length?{demoReportSources:t.demoReportSources.map(compactDemoReport)}:{})}));
 const result={...body,turns};
 const bytes=()=>new TextEncoder().encode(JSON.stringify(result)).length;
 while(turns.length>1&&bytes()>176000)turns.shift();
 // Growing catalogs must not silently discard the newest follow-up context.
 // Shorten only the wire copy; saved and visible answers remain untouched.
 while(turns.length&&bytes()>176000&&turns[0].answer.length>512){
  turns[0].answer=turns[0].answer.slice(0,Math.max(512,Math.floor(turns[0].answer.length/2)));
 }
 if(bytes()>176000)throw Error('本次演示资料太多，请缩小数据集后重试。');
 return result;
}
