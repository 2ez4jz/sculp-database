// Framework-neutral CRM rules. No network, storage, model calls or business side effects.
export const CRM_VERSION = '3.0-rc1';
export const industryTemplates = Object.freeze({
  dealer: {name:'Used car dealer',stages:['New lead','Contacted','Appointment','Test drive','Negotiation','Sold'],terminal:['Sold'],currency:'CAD'},
  studio: {name:'Service studio',stages:['Inquiry','Confirmed','Completed','Cancelled'],terminal:['Completed','Cancelled'],currency:'CAD'}
});
export function businessDate(now=new Date(),timezone='America/Toronto') {
  return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export const validISODate = v => typeof v==='string' && /^20\d{2}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T12:00:00Z')) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function resolveDate(text,today=businessDate()) {
  if(!validISODate(today))throw Error('Invalid reference date');
  const s=String(text||'').trim().toLowerCase();
  if(validISODate(s))return {date:s,ambiguous:false};
  const offsets={'今天':0,today:0,'明天':1,tomorrow:1,'后天':2,'day after tomorrow':2,'昨天':-1,yesterday:-1};
  if(Object.hasOwn(offsets,s)){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offsets[s]);return {date:d.toISOString().slice(0,10),ambiguous:false};}
  // “Next week” has no unique weekday. Never silently interpret it as exactly +7 days.
  return {date:null,ambiguous:true};
}
const text=v=>String(v??'').normalize('NFKC').trim();
export const normalizeEmail=v=>text(v).toLowerCase();
export function normalizePhone(v){let s=text(v).replace(/\D/g,'');if(s.length===11&&s[0]==='1')s=s.slice(1);return s.length>=7?s:'';}
const nameKey=v=>text(v).toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export function duplicateGroups(customers) {
  const groups=[];
  for(const [field,normalize,confidence] of [['email',normalizeEmail,'strong'],['phone',normalizePhone,'strong'],['name',nameKey,'review']]){
    const map=new Map();
    for(const c of customers){const value=normalize(c[field]??(field==='name'?c.display_name:''));if(!value)continue;const list=map.get(value)||[];list.push(c.id);map.set(value,list);}
    for(const [value,ids] of map)if(ids.length>1)groups.push({field,value,ids,confidence,action:'review_only'});
  }
  return groups;
}
export function customerTimeline(db,customerId) {
  if(!db.customers.some(c=>c.id===customerId))throw Error('Customer not found');
  const c=db.customers.find(c=>c.id===customerId),events=[{id:'created:'+c.id,type:'created',date:c.created,title:'客户建立 / Customer created',text:c.notes||''}];
  for(const i of db.interactions.filter(i=>i.customerId===customerId))events.push({id:i.id,type:'interaction',date:i.date,title:i.kind||'沟通 / Interaction',text:i.note||'',owner:i.owner});
  for(const s of db.sales.filter(s=>s.customerId===customerId))events.push({id:s.id,type:'sale',date:s.date,title:'已成交 / Sale recorded',amount:s.price,vehicleId:s.vehicleId});
  for(const t of db.crm?.tasks||[])if(t.customerId===customerId)events.push({id:t.id,type:'task',date:t.dueDate,title:t.title,status:t.status});
  return events.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));
}
export function crmState(db){return {tasks:[],runs:[],fields:[],...db.crm};}
export function workflowCandidates(db,{today=businessDate(),staleDays=14}={}) {
  if(!validISODate(today)||!Number.isInteger(staleDays)||staleDays<1||staleDays>365)throw Error('Invalid workflow scope');
  const result=[],terminal=new Set(industryTemplates.dealer.terminal);
  for(const c of db.customers){
    if(terminal.has(c.stage))continue;
    if(validISODate(c.followUp)&&c.followUp<=today)result.push({key:'followup:'+c.id+':'+c.followUp,rule:'followup_due',customerId:c.id,dueDate:c.followUp,title:'跟进客户 / Follow up · '+c.name,reason:'已记录的跟进日期已到 / Recorded follow-up is due',evidence:{followUp:c.followUp,stage:c.stage}});
    const last=c.lastContact||c.created;
    if(validISODate(last)&&last<=today&&(Date.parse(today+'T12:00:00Z')-Date.parse(last+'T12:00:00Z'))/86400000>=staleDays)result.push({key:'stale:'+c.id+':'+last,rule:'stale_contact',customerId:c.id,dueDate:today,title:'检查未联系客户 / Review stale lead · '+c.name,reason:`至少 ${staleDays} 天未记录联系 / No contact recorded`,evidence:{lastContact:last,stage:c.stage}});
  }
  // A missing receipt or a sales/receipt difference is never treated as overdue debt.
  for(const i of db.invoices||[]){
    if(i.status!=='issued'||i.currency!=='CAD'||!validISODate(i.dueDate)||i.dueDate>=today||!Number.isSafeInteger(i.totalCents)||i.totalCents<0)continue;
    const payments=(db.payments||[]).filter(p=>p.invoiceId===i.id&&p.status==='succeeded');
    if(payments.some(p=>p.currency!=='CAD'||!Number.isSafeInteger(p.amountCents)||p.amountCents<0)||!db.customers.some(c=>c.id===i.customerId))continue;
    const paid=payments.reduce((n,p)=>n+p.amountCents,0),balance=i.totalCents-paid;
    if(balance>0)result.push({key:'invoice:'+i.id+':'+i.dueDate,rule:'invoice_overdue',customerId:i.customerId,dueDate:i.dueDate,title:'核对到期付款 / Review overdue invoice',reason:'有效账单到期且成功付款不足 / Issued invoice has an unpaid balance',evidence:{invoiceId:i.id,totalCents:i.totalCents,paidCents:paid,balanceCents:balance}});
  }
  return result;
}
export function runWorkflows(db,options={}) {
  const crm=structuredClone(crmState(db)),candidates=workflowCandidates(db,options),now=options.now||new Date().toISOString();
  let created=0;
  for(const c of candidates){if(crm.runs.some(r=>r.key===c.key))continue;
    const task={...c,id:crypto.randomUUID(),status:'open',source:'workflow',version:1,createdAt:now};
    crm.tasks.push(task);crm.runs.push({key:c.key,rule:c.rule,taskId:task.id,status:'succeeded',attempts:1,at:now});created++;
  }
  if(crm.tasks.length>2000||crm.runs.length>4000)throw Error('Task capacity reached; archive reviewed work before retrying');
  return {crm,created,candidates:candidates.length};
}
export function dailyDigest(db,today=businessDate()) {
  if(!validISODate(today))throw Error('Invalid digest date');
  const tasks=crmState(db).tasks.filter(t=>t.status==='open'),due=tasks.filter(t=>t.dueDate&&t.dueDate<=today);
  return {today,open:tasks.length,due:due.length,overdue:due.filter(t=>t.dueDate<today).length,unassigned:tasks.filter(t=>!t.assignee).length,byRule:Object.fromEntries([...new Set(tasks.map(t=>t.rule||'manual'))].map(r=>[r,tasks.filter(t=>(t.rule||'manual')===r).length])),duplicates:duplicateGroups(db.customers).length};
}
export const csvCell=v=>'"'+String(v??'').replace(/^[\s\u0000-\u001f]*[=+@-]/,m=>"'"+m).replaceAll('"','""')+'"';
export function parseCSV(source,{maxRows=1000}={}) {
  if(typeof source!=='string'||source.length>1000000)throw Error('CSV too large');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else if(quoted)quoted=false;else if(!cell)quoted=true;else throw Error('Invalid CSV quote');}
    else if(!quoted&&(c===','||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!==','){if(c==='\r'&&source[i+1]==='\n')i++;if(row.some(x=>x.trim()))rows.push(row);row=[];if(rows.length>maxRows+1)throw Error('Too many CSV rows');}}else cell+=c;}
  if(quoted)throw Error('Unclosed CSV quote');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  if(rows.length>maxRows+1)throw Error('Too many CSV rows');
  if(!rows.length)return [];
  const headers=rows.shift().map(s=>s.replace(/^\ufeff/,'').trim());if(new Set(headers).size!==headers.length||headers.some(h=>!h||['__proto__','constructor','prototype'].includes(h)))throw Error('Invalid or duplicate CSV headers');
  return rows.map((r,i)=>{if(r.length!==headers.length)throw Error('CSV column mismatch on row '+(i+2));return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
export function validateCustomValue(def,value) {
  if(!def||!/^[a-z][a-z0-9_]{0,39}$/.test(def.key)||!['text','number','date','select'].includes(def.type))throw Error('Invalid custom field');
  if(value===null||value==='')return null;
  if(def.type==='number'){if(typeof value!=='number'||!Number.isFinite(value))throw Error('Expected number');return value;}
  if(typeof value!=='string'||value.length>1000)throw Error('Expected short text');
  if(def.type==='date'&&!validISODate(value))throw Error('Expected valid date');
  if(def.type==='select'&&(!Array.isArray(def.options)||!def.options.includes(value)))throw Error('Invalid option');return value;
}
