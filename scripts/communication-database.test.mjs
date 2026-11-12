import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,migrate} from './support/cloud-database.mjs';
const id=n=>`24000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),ops=id(2),artist=id(3),inactive=id(4);
const as=async(db,user,role='authenticated')=>{await db.exec('reset role;set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);};
const cmd=(db,action,payload,request=crypto.randomUUID())=>db.query('select sculpy_communication_command($1,$2,$3) d',[request,action,payload]).then(r=>r.rows[0].d);
const context=(db,type,entity,before=null)=>db.query('select sculpy_communication_context($1,$2,$3,$4) d',[type,entity,before?.created_at||null,before?.id||null]).then(r=>r.rows[0].d);
test('V2.4 real relational flow: private attachments, immutable originals, human summary, roles, replay and conversion',async()=>{
 const db=await createDatabase({applyMigrations:false});
 try{
  await db.exec('create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;');
  await migrate(db,{pglite:!db.connect});await db.exec('grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;');
  for(const [user,role,active] of [[owner,'owner',true],[ops,'operations',true],[artist,'artist',true],[inactive,'owner',false]]){await db.query('insert into auth.users(id) values($1)',[user]);await db.query('insert into profiles(id,display_name,role,active) values($1,$2,$2::text::app_role,$3)',[user,role,active]);}
  assert.equal((await db.query("select public from storage.buckets where id='sculpy-communications'")).rows[0].public,false);
  await as(db,owner);
  const leadPayload={confirmed:true,reason:'Fictional V24 evidence',name:'V24 Fictional Client',contact:'fictional-wechat',service:'Wedding',serviceType:'wedding',source:'instagram',sourceDetail:'fictional campaign',status:'pending',firstContact:'2026-11-01',details:'Half day inquiry, no confirmed price'};
  const lead=(await db.query("select sculpy_wedding_command($1,'save_lead',$2) d",[crypto.randomUUID(),leadPayload])).rows[0].d.leadId;
  const other=(await db.query("select sculpy_wedding_command($1,'save_lead',$2) d",[crypto.randomUUID(),{...leadPayload,name:'Another fictional client'}])).rows[0].d.leadId;
  const noteId=crypto.randomUUID(),fileId=crypto.randomUUID(),path=`${owner}/${noteId}/${fileId}.png`;
  await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['sculpy-communications',path,{size:80,mimetype:'image/png'}]);
  const attachment={id:fileId,path,name:'虚构聊天.png',mime:'image/png',size:80};
  const payload={type:'lead',id:lead,text:'原文\n'.repeat(9000),kind:'mixed',attachments:[attachment]};
  await cmd(db,'add_record',payload,noteId);assert.equal((await cmd(db,'add_record',payload,noteId)).replayed,true);
  await assert.rejects(()=>cmd(db,'add_record',{...payload,text:'changed'},noteId),e=>e.code==='23505');
  const second=await cmd(db,'add_record',{type:'lead',id:lead,text:'客户后来改为全天，报价未确认。',kind:'text',attachments:[]});
  let c=await context(db,'lead',lead);assert.equal(c.total,2);assert.equal(c.pending,2);assert.equal(c.records.find(r=>r.id===noteId).raw_text.length,payload.text.length);assert.equal(c.records.find(r=>r.id===noteId).attachments.length,1);
  assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,0);
  await assert.rejects(()=>db.query("update communication_records set raw_text='tampered'"),/permission denied/);
  const content={needs:['人工修改：全天需求'],confirmed:[],pending:['套餐和价格待确认'],changes:['半天改为全天'],followUp:['核对服务时间']};
  await assert.rejects(()=>cmd(db,'confirm_summary',{type:'lead',id:other,sourceIds:[noteId],content,confirmed:true}),e=>e.code==='42501');
  await assert.rejects(()=>cmd(db,'confirm_summary',{type:'lead',id:lead,sourceIds:[noteId],content,confirmed:false}),/确认/);
  const summaryId=crypto.randomUUID(),summary={type:'lead',id:lead,sourceIds:[noteId,second.recordId],content,confirmed:true};
  await cmd(db,'confirm_summary',summary,summaryId);assert.equal((await cmd(db,'confirm_summary',summary,summaryId)).replayed,true);
  c=await context(db,'lead',lead);assert.equal(c.pending,0);assert.deepEqual(c.summaries[0].content,content);assert.equal(c.summaries[0].confirmed_by,owner);
  const newRecord=await cmd(db,'add_record',{type:'lead',id:lead,text:'新消息尚未整理',kind:'text',attachments:[]});assert.equal((await context(db,'lead',lead)).pending,1);
  await db.exec('reset role');
  const service=(await db.query("select id from services where code='wedding'")).rows[0].id;await as(db,owner);
  const conversion={leadId:lead,revision:2,draft:{clientId:'',clientName:leadPayload.name,city:'Toronto',date:'2027-07-24',time:'10:00',serviceId:service,artistId:'',location:'Fictional venue',details:'Human reviewed',budget:''},rawText:'Fictional booking source',recordedAt:new Date().toISOString(),confirmed:true};
  const request=crypto.randomUUID(),converted=await cmd(db,'convert_lead',conversion,request);
  assert.equal((await cmd(db,'convert_lead',conversion,request)).replayed,true);
  await assert.rejects(()=>cmd(db,'convert_lead',conversion),e=>e.code==='40001');
  c=await context(db,'booking',converted.bookingId);assert.equal(c.total,3);assert.equal(c.summaries.length,1);assert.equal(c.records.find(r=>r.id===noteId).attachments.length,1);
  await db.exec('reset role');
  const b=(await db.query('select source,price_cad,status,originating_enquiry_id from bookings where id=$1',[converted.bookingId])).rows[0];assert.equal(b.source,'instagram');assert.equal(b.price_cad,null);assert.equal(b.status,'inquiry');assert.equal(b.originating_enquiry_id,lead);
  await as(db,ops);assert.equal((await context(db,'booking',converted.bookingId)).total,3);assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,1);
  const sources=(await db.query('select sculpy_communication_sources($1,$2,$3) d',['booking',converted.bookingId,[noteId,newRecord.recordId]])).rows[0].d;assert.equal(sources.length,2);
  assert.equal((await db.query('select sculpy_communication_inbox() d')).rows[0].d[0].id,converted.bookingId);
  for(const user of [artist,inactive]){await as(db,user);assert.equal((await db.query('select * from communication_records')).rows.length,0);assert.equal((await db.query('select * from communication_attachments')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(()=>context(db,'lead',lead),e=>e.code==='42501');await assert.rejects(()=>cmd(db,'add_record',{...payload,text:'forged'}),e=>e.code==='42501');await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('sculpy-communications',$1)",[`${user}/fake/file.png`]),/row-level security/);}
  await as(db,null,'anon');await assert.rejects(()=>context(db,'lead',lead),/permission denied/);await assert.rejects(()=>db.query('select * from communication_records'),/permission denied/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from clients')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n,1);
 }finally{await db.close();}
});
