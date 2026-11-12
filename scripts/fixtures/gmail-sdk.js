import {createClient as base} from './os-foundation-sdk.js';
const message={id:'50000000-0000-4000-8000-000000000010',gmail_id:'abc',thread_id:'thread',account_id:'account',from_addresses:['avery@example.test'],to_addresses:['studio@example.test'],subject:'Fictional wedding question',body:'Wedding on July 24, 2027.\n<script>window.bad=true</script>\nPlease confirm the details.',snippet:'Date and styling question',sent_at:'2026-11-12T14:00:00Z',direction:'incoming',clients:['24000000-0000-4000-8000-000000000041'],orders:[],attachments:[{name:'inspiration.pdf'}]};
export function createClient(){const c=base(),rpc=c.rpc,invoke=c.functions?.invoke;
 c.rpc=async(name,args={})=>{(window.gmailCalls??=[]).push({name,args});if(name==='sculpy_gmail_read')return {data:{accounts:[{id:'account',email:'studio@example.test',active:true,aiEnabled:true,status:'connected',lastSync:'2026-11-12T14:00:00Z',rules:{newHours:2,quoteHours:48,secondDays:5}}],messages:[message],ai:[],total:1,stats:{pending:1,today:1,unlinked:0},candidates:[]}};if(name==='sculpy_gmail_action')return {data:{ok:true}};return rpc(name,args);};
 c.functions={invoke:async(name,{body})=>{
  if(name==='sculpy-gmail'){(window.gmailCalls??=[]).push({action:body.action});if(body.action==='state')return {data:{configured:false,accounts:[{email:'studio@example.test',active:true,aiEnabled:true,status:'connected',rules:{newHours:2,quoteHours:48,secondDays:5}}]}};return {data:{content:body.action==='reply'?{text:'Thank you for reaching out. Could you confirm your service date and location?'}:{fields:{date:{status:'proposed',value:'2027-07-24'}},summary:['The client asks about styling.']}}};}
  return invoke?.(name,{body})||{data:{ok:true}};
 }};return c;
}
