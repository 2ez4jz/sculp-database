import test from 'node:test';import assert from 'node:assert/strict';import {createDatabase} from './support/cloud-database.mjs';
const id=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function as(db,n,role='authenticated'){await db.exec('reset role;set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);}
async function fixture(db){for(const[n,role,active]of [[1,'operations',true],[2,'owner',true],[3,'artist',true],[4,'owner',false]]){await db.query('insert into auth.users(id) values($1)',[id(n)]);await db.query('insert into profiles(id,display_name,role,active) values($1,$2,$3,$4)',[id(n),'Fictional '+role,role,active]);}}
const server=(db,a,p={})=>db.query('select sculpy_gmail_server($1,$2) d',[a,p]).then(r=>r.rows[0].d);
const read=(db,p=null)=>db.query("select sculpy_gmail_read($1,null,null,'all','') d",[p]).then(r=>r.rows[0].d);
const action=(db,a,p)=>db.query('select sculpy_gmail_action($1,$2) d',[a,{confirmed:true,...p}]);
test('Gmail SQL: roles, protected tokens, one-use OAuth, disconnect invalidates in-flight worker and redacts retained mail',async()=>{
 const db=await createDatabase();try{await fixture(db);
 for(const n of [3,4,null]){await as(db,n,n?'authenticated':'anon');await assert.rejects(()=>read(db));await assert.rejects(()=>server(db,'claim'));}
 await as(db,1);await assert.rejects(()=>db.query('select token_cipher from sculpy_private.gmail_accounts'));
 await as(db,null,'service_role');await server(db,'oauth_start',{actor:id(1),hash:'hash',verifier:'encrypted'});
 assert.equal((await server(db,'oauth_consume',{hash:'hash'})).verifier,'encrypted');await assert.rejects(()=>server(db,'oauth_consume',{hash:'hash'}));
 await server(db,'connect',{actor:id(1),email:'studio@example.test',cipher:'protected'});const a=await server(db,'claim',{force:true});assert(a.lease);assert.equal(await server(db,'claim',{force:true}),null);
 const old=await server(db,'disconnect',{actor:id(1)});assert.equal(old.cipher,'protected');await assert.rejects(()=>server(db,'finish',{account:a.id,lease:a.lease}));
 await as(db,2);const r=await read(db);assert.equal(r.accounts[0].active,false);assert(!JSON.stringify(r).includes('protected'));
 }finally{await db.close();}
});
test('Gmail SQL: exact-email enquiry dedupe, ambiguous order isolation, message replay, manual unlink and AI opt-in',async()=>{
 const db=await createDatabase();try{await fixture(db);await db.exec(`insert into website_enquiries(submission_id,name,email,service,status) values('${id(10)}','A','avery@example.test','Wedding','pending'),('${id(11)}','A again','AVERY@example.test','Trial','pending')`);
 await as(db,null,'service_role');await server(db,'contacts');await server(db,'contacts');
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from clients')).rows[0].n,1);const cid=(await db.query('select id from clients')).rows[0].id;
 await db.query("insert into bookings(id,client_id,starts_at,status) values($1,$2,now(),'inquiry'),($3,$2,now(),'inquiry')",[id(20),cid,id(21)]);
 const number=(await db.query('select order_number from bookings where id=$1',[id(20)])).rows[0].order_number;
 await as(db,null,'service_role');await server(db,'connect',{actor:id(1),email:'studio@example.test',cipher:'protected'});const a=await server(db,'claim',{force:true}),base={account:a.id,lease:a.lease};
 const msg={id:'abc',threadId:'thread',from:['avery@example.test'],to:['studio@example.test'],subject:'Wedding and trial',body:'My two services',snippet:'hello',direction:'incoming',sentAt:new Date().toISOString(),attachments:[]};
 await server(db,'ingest',{...base,messages:[msg]});await server(db,'ingest',{...base,messages:[msg]});
 await as(db,1);let r=await read(db);assert.equal(r.total,1);assert.equal(r.messages[0].clients.length,1);assert.equal(r.messages[0].orders.length,0);
 const mid=r.messages[0].id;assert.equal((await read(db,mid)).messages[0].body,'My two services');
 await action(db,'link_order',{message:mid,booking:id(20),linked:true});await action(db,'link_order',{message:mid,booking:id(20),linked:false});
 await as(db,null,'service_role');await server(db,'ingest',{...base,messages:[{...msg,subject:'Order '+number}]});
 await assert.rejects(()=>server(db,'ai_store',{actor:id(1),message:mid,kind:'summary',content:{}}));
 await as(db,1);assert.equal((await read(db,mid)).messages[0].orders.length,0);await action(db,'settings',{aiEnabled:true});
 await as(db,null,'service_role');assert((await server(db,'ai_context',{message:mid,actor:id(1)})).message.body);await server(db,'ai_store',{actor:id(1),message:mid,kind:'reply',content:{text:'Draft'}});
 await db.exec('reset role');await db.query("insert into clients(id,display_name) values($1,'Unresolved duplicate')",[id(99)]);await db.query('insert into client_private(client_id,email) values($1,$2)',[id(99),'avery@example.test']);
 await as(db,null,'service_role');assert.equal((await server(db,'ingest',{...base,messages:[{...msg,id:'ambiguous'}]})).count,0);
 await as(db,1);await assert.rejects(()=>action(db,'contact_email',{client:id(99),email:'avery@example.test'}));await action(db,'contact_email',{client:id(99),email:'verified@example.test'});
 await as(db,null,'service_role');
 await server(db,'finish',{...base,cursor:'100',scan:null,count:1});await server(db,'disconnect',{actor:id(1)});
 await as(db,1);r=await read(db,mid);assert.equal(r.messages[0].body,'');assert.equal(r.ai.length,0);assert.equal(r.messages[0].subject,'');
 }finally{await db.close();}
});
test('Gmail followups use incoming/outgoing chronology, dedupe tasks and stop ordinary followup when paused',async()=>{
 const db=await createDatabase();try{await fixture(db);await db.query("insert into clients(id,display_name) values($1,'A')",[id(30)]);await db.query("insert into client_private(client_id,email) values($1,'avery@example.test')",[id(30)]);
 await as(db,null,'service_role');await server(db,'connect',{actor:id(1),email:'studio@example.test',cipher:'secret'});
 await db.exec("reset role;update sculpy_private.gmail_accounts set updated_at=now()-interval '7 days'");await as(db,null,'service_role');
 const a=await server(db,'claim',{force:true}),base={account:a.id,lease:a.lease};
 const m={id:'incoming',threadId:'t',from:['avery@example.test'],to:['studio@example.test'],subject:'New inquiry',body:'Wedding',snippet:'',attachments:[],direction:'incoming',sentAt:new Date(Date.now()-3*3600000).toISOString()};
 await server(db,'ingest',{...base,messages:[m]});await server(db,'finish',{...base,cursor:'100',scan:null});
 await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from reminders where status='open'")).rows[0].n,2);
 await as(db,1);await action(db,'state',{client:id(30),state:'paused'});
 await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from reminders where status='dismissed'")).rows[0].n,1);
 await as(db,null,'service_role');const b=await server(db,'claim',{force:true}),next={account:b.id,lease:b.lease};
 await server(db,'ingest',{...next,messages:[{...m,id:'sent',from:['studio@example.test'],to:['avery@example.test'],direction:'outgoing',sentAt:new Date().toISOString()}]});await server(db,'finish',{...next,cursor:'101',scan:null});
 await as(db,1);const result=await read(db);assert.equal(result.stats.pending,0);
 }finally{await db.close();}
});
