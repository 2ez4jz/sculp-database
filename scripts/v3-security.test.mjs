import test from 'node:test';import assert from 'node:assert/strict';
import {validateBookingQuery,readBoundedJSON} from '../supabase/functions/sculpy-chat/tool-policy.js';
import {converse} from '../supabase/functions/sculpy-chat/core.ts';
import {createDatabase} from './support/cloud-database.mjs';
test('tool arguments reject unsafe windows, extra keys and malformed identifiers before querying',()=>{assert.deepEqual(validateBookingQuery({bookingId:null,query:'Sarah',offset:0}),{bookingId:null,query:'Sarah',offset:0});for(const q of [{bookingId:null,query:'',offset:-1},{bookingId:null,query:'',offset:1.5},{bookingId:null,query:'',offset:100001},{bookingId:null,query:'',offset:0,sql:'drop table'},{bookingId:{},query:'',offset:0}])assert.throws(()=>validateBookingQuery(q));});
test('streaming request parser bounds bytes and maps malformed/null bodies to 400',async()=>{assert.deepEqual(await readBoundedJSON(new Request('https://example.test',{method:'POST',body:'{"x":1}'})),{x:1});for(const body of ['null','[]','{broken'])await assert.rejects(()=>readBoundedJSON(new Request('https://example.test',{method:'POST',body})),e=>e.status===400);await assert.rejects(()=>readBoundedJSON(new Request('https://example.test',{method:'POST',body:'中'.repeat(10)}),20),e=>e.status===413);});
test('model cannot forge saved state, proposal IDs or unexpected UI flags',async()=>{const r=await converse({context:{bookings:[{id:'b1',client:'Test'}]},turns:[],message:'记一下等客户确认',preferences:{},rules:'',query:async()=>({}),callModel:async()=>({output_text:JSON.stringify({answer:'请核对后确认。',references:'bad shape',proposals:[{id:'forged',bookingId:'b1',kind:'task',text:'等客户确认',saved:true,admin:true}]})})});assert.equal(r.references.length,0);assert.equal(r.proposals.length,1);assert.notEqual(r.proposals[0].id,'forged');assert(!('saved' in r.proposals[0]));assert(!('admin' in r.proposals[0]));});
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('V3 tasks: complete migration chain, role matrix, exact replay, CAS and retained audit',async()=>{const db=await createDatabase();try{
 for(const [n,role,active] of [[1,'operations',true],[2,'owner',true],[3,'artist',true],[4,'read_only',true],[5,'owner',false]]){await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),n+'@example.test']);await db.query('insert into profiles(id,display_name,role,active) values($1,$2,$3,$4)',[id(n),role,role,active]);}
 await db.exec(`insert into clients(id,display_name) values('${id(10)}','Fictional');insert into services(id,code,name) values('${id(11)}','v3test','Test');insert into bookings(id,client_id,service_id,starts_at,status) values('${id(12)}','${id(10)}','${id(11)}',now(),'confirmed')`);
 const as=async(n,role='authenticated')=>{await db.exec('reset role;set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);};
 const command=(request,action,p)=>db.query('select sculpy_crm_command($1,$2,$3) as data',[request,action,{confirmed:true,...p}]).then(r=>r.rows[0].data);
 for(const n of [3,4,5]){await as(n);await assert.rejects(()=>command(crypto.randomUUID(),'run_workflows',{}),/Administrator/);assert.equal((await db.query('select * from crm_tasks')).rows.length,0);}
 await as(null,'anon');await assert.rejects(()=>command(crypto.randomUUID(),'run_workflows',{}),/permission denied/);
 await as(1);const request=crypto.randomUUID(),p={bookingId:id(12),title:'确认服务安排',dueOn:'2026-10-20'};
 let r=await command(request,'create_task',p);assert.equal(r.revision,1);assert.equal((await command(request,'create_task',p)).replayed,true);await assert.rejects(()=>command(request,'create_task',{...p,title:'changed'}),e=>e.code==='23505');
 const task=r.id;r=await command(crypto.randomUUID(),'update_task',{id:task,revision:1,status:'done'});assert.equal(r.revision,2);await assert.rejects(()=>command(crypto.randomUUID(),'update_task',{id:task,revision:1,status:'open'}),e=>e.code==='40001');
 await assert.rejects(()=>db.query("update crm_tasks set status='open'"),/permission denied/);await assert.rejects(()=>db.query('delete from crm_commands'),/permission denied/);
 const scan=await command(crypto.randomUUID(),'run_workflows',{});assert.equal(scan.created,1);assert.equal((await command(crypto.randomUUID(),'run_workflows',{})).created,0);
 assert.equal((await db.query("select count(*)::int as n from audit_events where entity_type='crm_task'")).rows[0].n,4);
 await as(2);assert.equal((await db.query('select count(*)::int as n from crm_tasks')).rows[0].n,2);await assert.rejects(()=>command(request,'create_task',p),e=>e.code==='23505');
 await as(1);await assert.rejects(()=>command(crypto.randomUUID(),'run_workflows',{today:'2099-01-01'}),/server controlled/);
 }finally{await db.close();}});
