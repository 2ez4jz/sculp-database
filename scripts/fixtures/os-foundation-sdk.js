// Fictional browser acceptance only; never imported by application code.
import {createClient as baseClient} from './communication-sdk.js';
const leadId='24000000-0000-4000-8000-000000000011';
const bookingId='24000000-0000-4000-8000-000000000021';
export function createClient(){
 const client=baseClient(),baseRpc=client.rpc;
 const tasks=[{assigned_to:'24000000-0000-4000-8000-000000000001',id:'task',reason:'确认客户档期',due_at:'2026-11-12T12:00:00Z',booking_id:bookingId,client:'Fictional Avery',assignee:'QA operations',status:'open',edit_version:'1'}];
 const commands=new Map(),imports=new Map();
 const people=[{id:'24000000-0000-4000-8000-000000000001',name:'QA operations'},{id:'24000000-0000-4000-8000-000000000002',name:'Miranda'}];
 let clientInfo={id:'24000000-0000-4000-8000-000000000041',display_name:'Fictional Avery',referral_source:'Instagram',city:'Toronto',lifecycle_status:'active',tags:[]},contact={email:'avery@example.test',phone:'416-555-0100'},revision='rev1';
 client.rpc=async(name,args={})=>{
  (globalThis.osCalls??=[]).push({name,args});
  if(name==='sculpy_os_task_context')return {data:{actor:people[0].id,assignees:people}};
  if(name==='sculpy_os_overview'){
   if(globalThis.osReadError)return {error:{code:'42501'}};
   return {data:{asOf:new Date().toISOString(),today:'2026-11-12',pendingEnquiries:5,todayTasks:1,overdueTasks:0,weekBookings:2,unfinishedOrders:3,receivableCents:'12345',receivableUnknown:1,
    tasks:tasks.filter(t=>t.status==='open'),taskCount:tasks.filter(t=>t.status==='open').length,
    followups:[{id:leadId,name:'Fictional Avery',status:'pending'}],followupCount:1,
    upcoming:[{id:bookingId,order_number:'612358',client:'Fictional Avery',starts_at:'2027-07-24T14:00:00Z',status:'inquiry'}]}};
  }
  if(name==='sculpy_os_tasks_v32')return {data:{total:tasks.filter(t=>t.status===args.p_status&&(args.p_scope!=='mine'||t.assigned_to===people[0].id)).length,tasks:tasks.filter(t=>t.status===args.p_status&&(args.p_scope!=='mine'||t.assigned_to===people[0].id))}};
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
  if(name==='sculpy_os_client_detail_v32')return {data:{revision,client:{...clientInfo,id:args.p_client_id},contact,total:1,bookings:[{id:bookingId,order_number:'612358',service:'Wedding',starts_at:'2027-07-24T14:00:00Z',status:'inquiry'}]}};
  if(name==='sculpy_os_client_review')return {data:{revision,fields:Object.fromEntries(Object.entries(args.p_fields).map(([k,v])=>[k,v===''?null:v])),possibleDuplicates:[]}};
  if(name==='sculpy_os_update_client'){
   if(commands.has(args.p_request_id))return {data:commands.get(args.p_request_id)};
   if(args.p_expected_revision!==revision)return {error:{code:'40001'}};
   Object.assign(clientInfo,args.p_fields);Object.assign(contact,args.p_fields);revision+='x';
   const data={id:args.p_client_id,requestId:args.p_request_id};commands.set(args.p_request_id,data);
   if(globalThis.osLoseClientResponse){globalThis.osLoseClientResponse=false;throw Error('lost client response');}return {data};
  }
  if(name==='sculpy_os_reassign_task'){
   if(commands.has(args.p_request_id))return {data:commands.get(args.p_request_id)};
   const t=tasks.find(t=>t.id===args.p_task_id);if(!t||t.edit_version!==String(args.p_expected_version))return {error:{code:'40001'}};
   t.assigned_to=args.p_assigned_to;t.assignee=people.find(p=>p.id===args.p_assigned_to)?.name;t.edit_version=String(Number(t.edit_version)+1);
   const data={id:t.id,requestId:args.p_request_id};commands.set(args.p_request_id,data);return {data};
  }
  if(name==='sculpy_os_import_catalog')return {data:{services:[{code:'wedding',name:'Wedding',active:true}]}};
  if(name==='sculpy_os_import_preview'){
   const rows=args.p_rows.map((r,i)=>({line:r.line,action:imports.has(args.p_kind+(r.external_id||r.display_name))?'skip':'create',reason:'Fixture preview',sourceKey:r.external_id,normalized:{fields:r}}));
   return {data:{rows,creates:rows.filter(r=>r.action==='create').length,links:0,skips:rows.filter(r=>r.action==='skip').length,errors:0,ready:true,planHash:JSON.stringify(args.p_rows)}};
  }
  if(name==='sculpy_os_import_commit'){
   if(commands.has(args.p_request_id))return {data:commands.get(args.p_request_id)};
   let creates=0;const rows=args.p_rows.map((r,i)=>{const key=args.p_kind+(r.external_id||r.display_name),existed=imports.has(key);const id=imports.get(key)||'32000000-0000-4000-8000-'+String(r.line).padStart(12,'0');imports.set(key,id);if(!existed)creates++;return {line:r.line,action:existed?'skip':'create',id,reason:'Fixture saved'};});
   const data={id:args.p_request_id,requestId:args.p_request_id,rows,creates,links:0,skips:rows.length-creates};commands.set(args.p_request_id,data);
   if(globalThis.osLoseImportResponse){globalThis.osLoseImportResponse=false;throw Error('lost import response');}return {data};
  }
  if(name==='sculpy_os_clients')return {data:{total:1,clients:[{id:'24000000-0000-4000-8000-000000000041',display_name:'Fictional Avery',referral_source:'Instagram',order_count:1}]}};
  if(name==='sculpy_os_create_task_v32'||name==='sculpy_os_create_client'){
   if(globalThis.osLoseResponse){globalThis.osLoseResponse=false;throw Error('lost response');}
   return {data:{id:args.p_id}};
  }
  return baseRpc(name,args);
 };
 return client;
}
