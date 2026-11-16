// Fictional browser acceptance only; never imported by application code.
import {createClient as baseClient} from './communication-sdk.js';
const leadId='24000000-0000-4000-8000-000000000011';
const bookingId='24000000-0000-4000-8000-000000000021';
export function createClient(){
 const client=baseClient(),baseRpc=client.rpc;
 const tasks=[{id:'task',reason:'确认客户档期',due_at:'2026-11-12T12:00:00Z',booking_id:bookingId,client:'Fictional Avery',assignee:'QA operations',status:'open',edit_version:'1'}];
 const commands=new Map();
 client.rpc=async(name,args={})=>{
  (globalThis.osCalls??=[]).push({name,args});
  if(name==='sculpy_os_overview'){
   if(globalThis.osReadError)return {error:{code:'42501'}};
   return {data:{asOf:new Date().toISOString(),today:'2026-11-12',pendingEnquiries:5,todayTasks:1,overdueTasks:0,weekBookings:2,unfinishedOrders:3,receivableCents:'12345',receivableUnknown:1,
    tasks:tasks.filter(t=>t.status==='open'),taskCount:tasks.filter(t=>t.status==='open').length,
    followups:[{id:leadId,name:'Fictional Avery',status:'pending'}],followupCount:1,
    upcoming:[{id:bookingId,order_number:'612358',client:'Fictional Avery',starts_at:'2027-07-24T14:00:00Z',status:'inquiry'}]}};
  }
  if(name==='sculpy_os_tasks')return {data:{total:tasks.filter(t=>t.status===args.p_status).length,tasks:tasks.filter(t=>t.status===args.p_status)}};
  if(name==='sculpy_os_update_task'){
   if(commands.has(args.p_request_id))return {data:commands.get(args.p_request_id)};
   const task=tasks.find(t=>t.id===args.p_task_id);
   if(!task||task.edit_version!==String(args.p_expected_version))return {error:{code:'40001'}};
   task.status={complete:'done',cancel:'dismissed',reopen:'open'}[args.p_action]||task.status;
   if(args.p_due_on)task.due_at=args.p_due_on+'T17:00:00Z';
   task.edit_version=String(Number(task.edit_version)+1);
   const data={id:task.id,requestId:args.p_request_id};commands.set(args.p_request_id,data);
   if(globalThis.osLoseTaskResponse){globalThis.osLoseTaskResponse=false;throw Error('lost task response');}
   return {data};
  }
  if(name==='sculpy_os_client_detail')return {data:{client:{id:args.p_client_id,display_name:'Fictional Avery',referral_source:'Instagram',city:'Toronto',lifecycle_status:'active'},contact:{email:'avery@example.test',phone:'416-555-0100'},total:1,bookings:[{id:bookingId,order_number:'612358',service:'Wedding',starts_at:'2027-07-24T14:00:00Z',status:'inquiry'}]}};
  if(name==='sculpy_os_clients')return {data:{total:1,clients:[{id:'24000000-0000-4000-8000-000000000041',display_name:'Fictional Avery',referral_source:'Instagram',order_count:1}]}};
  if(name==='sculpy_os_create_task'||name==='sculpy_os_create_client'){
   if(globalThis.osLoseResponse){globalThis.osLoseResponse=false;throw Error('lost response');}
   return {data:{id:args.p_id}};
  }
  return baseRpc(name,args);
 };
 return client;
}
