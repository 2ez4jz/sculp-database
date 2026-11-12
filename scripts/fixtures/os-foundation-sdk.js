// Fictional browser acceptance only; never imported by application code.
import {createClient as baseClient} from './communication-sdk.js';
const leadId='24000000-0000-4000-8000-000000000011';
const bookingId='24000000-0000-4000-8000-000000000021';
export function createClient(){
 const client=baseClient(),baseRpc=client.rpc;
 client.rpc=async(name,args={})=>{
  (globalThis.osCalls??=[]).push({name,args});
  if(name==='sculpy_os_overview'){
   if(globalThis.osReadError)return {error:{code:'42501'}};
   return {data:{asOf:new Date().toISOString(),today:'2026-11-12',pendingEnquiries:5,todayTasks:1,overdueTasks:0,weekBookings:2,unfinishedOrders:3,receivableCents:'12345',receivableUnknown:1,
    tasks:[{id:'task',reason:'确认客户档期',due_at:'2026-11-12T12:00:00Z',booking_id:bookingId}],taskCount:1,
    followups:[{id:leadId,name:'Fictional Avery',status:'pending'}],followupCount:1,
    upcoming:[{id:bookingId,order_number:'612358',client:'Fictional Avery',starts_at:'2027-07-24T14:00:00Z',status:'inquiry'}]}};
  }
  if(name==='sculpy_os_clients')return {data:{total:1,clients:[{id:'24000000-0000-4000-8000-000000000041',display_name:'Fictional Avery',referral_source:'Instagram',order_count:1}]}};
  if(name==='sculpy_os_create_task'||name==='sculpy_os_create_client'){
   if(globalThis.osLoseResponse){globalThis.osLoseResponse=false;throw Error('lost response');}
   return {data:{id:args.p_id}};
  }
  return baseRpc(name,args);
 };
 return client;
}
