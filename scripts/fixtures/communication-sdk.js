// Fictional UI acceptance adapter. Used only by browser tests or ignored local dist.
// Never imported by the production application.
if(!crypto.randomUUID)crypto.randomUUID=()=>('10000000-1000-4000-8000-100000000000').replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
const fixture=await fetch(new URL('../../scripts/fixtures/wedding-v23.json',import.meta.url)).then(r=>r.json());
const owner='24000000-0000-4000-8000-000000000001';
const leadId='24000000-0000-4000-8000-000000000011';
const bookingId='24000000-0000-4000-8000-000000000021';
const qaParams=new URLSearchParams(location.search);
const mirandaId='24000000-0000-4000-8000-000000000002';
const welcomeKey='sculpy-fictional-qa-welcomes';
const welcomes=JSON.parse(localStorage.getItem(welcomeKey)||'null')||[{id:owner,display_name:'Jz · 虚构验收',username:'sculp_jz',welcome_message:'',welcome_revision:0},{id:mirandaId,display_name:'Miranda · 虚构验收',username:'sculp_miranda',welcome_message:'欢迎最美化妆师Miranda亲临工作室指导工作',welcome_revision:1}];
const profile={...welcomes.find(a=>a.username===(qaParams.get('qa_username')||'sculp_jz')),role:qaParams.get('qa_role')||'operations',active:true};
const leads=[{id:leadId,name:'Fictional Avery',email:'avery@example.test',contact:'fixture_wechat',service:'Wedding',service_type:'wedding',status:qaParams.has('qa_pending')?'pending':'qualified',entry_channel:'manual',first_contact_at:'2026-11-01T14:00:00Z',event_date:'2027-07-24',revision:2,attribution_source:'instagram',details:'客户希望清透妆感，套餐待确认。',notes:'虚构验收记录',is_test:false}];
const records=[{id:'24000000-0000-4000-8000-000000000031',enquiry_id:leadId,booking_id:null,raw_text:'第一次咨询：想了解半天套餐，日期2027年7月24日。后来改口希望覆盖晚宴，价格尚未确认。',author:'Miranda · 虚构',author_id:owner,created_at:'2026-11-02T10:00:00Z',attachments:[],reviewed:false}];
const summaries=[],files=new Map(),replays=new Map();
const aiContent={needs:['全天婚礼妆发，包含晚宴时段（待核对）'],confirmed:['客户提供日期：2027年7月24日'],pending:['确认套餐覆盖时长、报价及化妆师档期'],changes:['从半天需求变为希望覆盖晚宴'],followUp:['向客户确认准备开始时间和晚宴结束时间']};
const originalFetch=globalThis.fetch;
const noticeId='35000000-0000-4000-8000-000000000201',testNoticeId='35000000-0000-4000-8000-000000000202',deviceId='35000000-0000-4000-8000-000000000301';
const pushFixtureKey='sculpy-fictional-push-'+profile.id;
const pushState=JSON.parse(localStorage.getItem(pushFixtureKey)||'null')||{preferences:{enabled:false,new_enquiry:true,overdue:true},devices:[],items:[],config:{enabled:true,overdueHours:24,repeatHours:0,schedulerInstalled:true,lastTickAt:'2026-11-02T17:00:00Z'}};
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('/functions/v1/sculpy-notifications')){
  const {action,data={}}=JSON.parse(options.body);(globalThis.qaPushCalls??=[]).push({action,data});
  let value={ok:true};
  if(action==='state')value={preferences:pushState.preferences,devices:pushState.devices,publicKey:'B'.repeat(87),systemEnabled:pushState.config.enabled,config:profile.role==='operations'?pushState.config:null};
  else if(action==='history')value={items:pushState.items};
  else if(action==='diagnostics')value={queue:{accepted:pushState.items.length},errors:[]};
  else if(action==='subscribe'){pushState.preferences.enabled=true;pushState.devices=[{id:deviceId,label:'Fictional browser',active:true,currentSession:true}];value={ok:true,deviceId};}
  else if(action==='unsubscribe'||action==='logout')pushState.devices.forEach(d=>d.active=false);
  else if(action==='preferences'){pushState.preferences=data;if(!data.enabled)pushState.devices.forEach(d=>d.active=false);}
  else if(action==='global'){if(profile.role!=='operations')return Response.json({error:'无权限'},{status:403});Object.assign(pushState.config,data);}
  else if(action==='test'){pushState.items.unshift({id:testNoticeId,kind:'test',title:'Sculpy 推送测试',created_at:new Date().toISOString(),read_at:null,deliveries:[{status:'accepted',attempts:1,code:null}]});value={ok:true,id:testNoticeId};}
  else if(action==='open'){if(profile.role!=='operations'&&profile.role!=='owner')return Response.json({error:'无权限'},{status:403});value={type:data.id===noticeId?'lead':'settings',id:leadId};}
  localStorage.setItem(pushFixtureKey,JSON.stringify(pushState));return Response.json(value);
 }
 return String(url).includes('/functions/v1/sculpy-intake?action=communication-')?Response.json(String(url).includes('communication-voice')?{text:'虚构转写：客户希望全天跟妆，报价待确认。'}:{content:aiContent,sourceIds:JSON.parse(options.body).sourceIds,requiresConfirmation:true,provider:'mock'}):originalFetch(url,options);
};
const booking={id:bookingId,order_number:'612358',client:'Fictional Avery',service:'Wedding Day Styling',starts_at:'2027-07-24T14:00:00Z',venue:'Fictional Toronto venue',artists:['Miranda'],status:'inquiry',service_details:'套餐待确认',price_cad:null,budget_cad:null};
export function createClient(){return {
 auth:{getSession:async()=>({data:{session:{access_token:'fictional-ui-session'}}}),getUser:async()=>({data:{user:{id:owner}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},
 storage:{from:()=>({upload:async(path,file)=>{files.set(path,file);return {};},download:async path=>({data:files.get(path)})})},
 from:table=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,update:()=>q,single:async()=>({data:table==='profiles'?profile:table==='sculpy_company_rules'?{content:'虚构验收规则'}:{}}),then:resolve=>Promise.resolve({data:table==='website_enquiries_business'?leads:table==='profiles'?[profile]:[]}).then(resolve)};return q;},
 rpc:async(name,args={})=>{
  (globalThis.qaCalls??=[]).push({name,args:structuredClone(args)});
  if(name==='list_account_welcomes'){
   if(globalThis.qaFailWelcomeRead){globalThis.qaFailWelcomeRead=false;return {error:{message:'Fictional read failure'}};}
   return {data:structuredClone(welcomes)};
  }
  if(name==='set_account_welcome'){
   const row=welcomes.find(a=>a.id===args.p_id);
   if(row.welcome_message!==args.p_message){
    if(globalThis.qaWelcomeConflict){globalThis.qaWelcomeConflict=false;row.welcome_message='另一台设备的新欢迎语';row.welcome_revision++;}
    if(row.welcome_revision!==args.p_revision)return {error:{code:'40001',message:'Fictional version conflict'}};
    row.welcome_message=args.p_message;row.welcome_revision++;
   }
   localStorage.setItem(welcomeKey,JSON.stringify(welcomes));
   if(globalThis.qaLoseWelcome){globalThis.qaLoseWelcome=false;return {error:{message:'Fictional lost acknowledgment'}};}
   return {data:structuredClone(row)};
  }
  if(name==='list_managed_accounts')return {data:[{...profile,username:'sculp_jz'},{id:'24000000-0000-4000-8000-000000000002',display_name:'Fictional Miranda',username:'sculp_miranda',role:'owner',active:true}]};
  if(name==='sculpy_wedding_report')return {data:fixture.report};
  if(name==='sculpy_context')return {data:{bookings:[booking],total:1}};
  if(name==='sculpy_order_detail')return {data:{bookings:[booking]}};
  if(name==='sculpy_wedding_detail')return {data:{...fixture.detail,bookingId}};
  if(name==='sculpy_communication_inbox')return {data:records.filter(r=>!summaries.some(s=>s.source_ids.includes(r.id))).length?[{id:leadId,type:'lead',label:'Fictional Avery',pending:records.filter(r=>!summaries.some(s=>s.source_ids.includes(r.id))).length}]:[]};
  if(name==='sculpy_communication_context'){
   const rows=records.filter(r=>args.p_type==='lead'?r.enquiry_id===args.p_id:r.booking_id===args.p_id||leads.some(l=>l.id===r.enquiry_id&&l.booking_id===args.p_id)).map(r=>({...r,reviewed:summaries.some(s=>s.source_ids.includes(r.id))}));
   return {data:{records:rows,total:rows.length,pending:rows.filter(r=>!r.reviewed).length,summaries:summaries.filter(s=>args.p_type==='lead'?s.enquiry_id===args.p_id:s.booking_id===args.p_id||leads.some(l=>l.id===s.enquiry_id&&l.booking_id===args.p_id))}};
  }
  if(name==='sculpy_intake_lookup')return {data:{clients:[],services:[{id:'24000000-0000-4000-8000-000000000041',code:'wedding',name:'Wedding Day Styling'}],artists:[]}};
  if(name==='sculpy_wedding_command'){
   const p=args.p_payload;let l=leads.find(x=>x.id===p.id);if(!l){l={id:crypto.randomUUID(),revision:1,first_contact_at:new Date().toISOString(),entry_channel:'manual'};leads.unshift(l);}
   Object.assign(l,{name:p.name,contact:p.contact,email:p.email,service:p.service,status:p.status,details:p.details,notes:p.reason,attribution_source:p.source,revision:l.revision+1});return {data:{leadId:l.id,revision:l.revision}};
  }
  if(name==='sculpy_communication_command'){
   if(replays.has(args.p_request_id))return {data:replays.get(args.p_request_id)};
   const p=args.p_payload;let result;
   if(args.p_action==='add_record'){
    records.push({id:args.p_request_id,enquiry_id:p.type==='lead'?p.id:null,booking_id:p.type==='booking'?p.id:null,raw_text:p.text,input_kind:p.kind,author:'Jz · 虚构验收',author_id:owner,created_at:new Date().toISOString(),attachments:p.attachments.map(a=>({id:a.id,object_path:a.path,name:a.name,mime_type:a.mime,byte_size:a.size}))});result={recordId:args.p_request_id};
   }else if(args.p_action==='confirm_summary'){
    summaries.unshift({id:args.p_request_id,enquiry_id:p.type==='lead'?p.id:null,booking_id:p.type==='booking'?p.id:null,source_ids:p.sourceIds,content:p.content,author:profile.display_name,confirmed_by:owner,confirmed_at:new Date().toISOString()});result={summaryId:args.p_request_id};
   }else{
    const l=leads.find(x=>x.id===p.leadId);l.booking_id=bookingId;l.revision++;result={bookingId,leadId:l.id};
   }
   replays.set(args.p_request_id,result);
   if(globalThis.qaLoseNote&&args.p_action==='add_record'){globalThis.qaLoseNote=false;return {error:{code:'08006',message:'Fictional lost acknowledgment'}};}
   return {data:result};
  }
  return {data:{}};
 }
};}
