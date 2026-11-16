import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './support/cloud-database.mjs';
const id=n=>`32000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rpc=(db,name,args=[])=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) d`,args).then(r=>r.rows[0].d);
async function fixture(db){
 for(const [n,role,active] of [[1,'operations',true],[2,'owner',true],[3,'artist',true],[4,'read_only',true],[5,'owner',false]]){
  await db.query('insert into auth.users(id) values($1)',[id(n)]);await db.query('insert into profiles(id,display_name,role,active) values($1,$2,$3,$4)',[id(n),'QA '+role,role,active]);
 }
 await db.query("insert into services(id,code,name) values($1,'wedding','Wedding') on conflict(code) do nothing",[id(9)]);
 await db.query("insert into clients(id,display_name) values($1,'Existing')",[id(10)]);
 await db.query("insert into client_private(client_id,email,phone) values($1,'existing@example.test','+1 416 555 0100')",[id(10)]);
}
async function as(db,n,role='authenticated'){await db.exec('reset role;set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);}
const fields=()=>({display_name:'Existing',preferred_name:'QA',phone:'+44 20 1234 5678',email:'qa+studio@example.test',wechat:'微信',instagram:'qa',referral_source:'Instagram',city:'Toronto',preferred_language:'中文',wedding_date:'2027-06-21',tags:['VIP'],internal_notes:'Internal note'});
const clientDetail=db=>rpc(db,'sculpy_os_client_detail_v32',[id(10),0]);
const preview=(db,kind,rows)=>rpc(db,'sculpy_os_import_preview',[kind,JSON.stringify(rows)]);
const commit=(db,n,kind,rows,plan,confirmed=true)=>rpc(db,'sculpy_os_import_commit',[id(n),kind,JSON.stringify(rows),plan.planHash,confirmed]);
const customer=(n,name='Imported')=>({line:n,external_id:'C'+n,display_name:name,email:'imported'+n+'@example.test'});
const order=(n=2)=>({line:n,external_id:'O'+n,client_choice:id(10),service:'wedding',service_date:'2027-06-21',start_time:'10:00',status:'completed',currency:'CAD',price:'',budget:'2000',details:'Historical service'});

test('V3.2 SQL: role matrix and private ledgers remain inaccessible',async()=>{
 const db=await createDatabase();try{
  await fixture(db);
  for(const n of [3,4,5,null]){await as(db,n,n?'authenticated':'anon');
   for(const [name,args] of [['sculpy_os_client_detail_v32',[id(10),0]],['sculpy_os_task_context',[]],['sculpy_os_import_catalog',[]],['sculpy_os_tasks_v32',['open',0,'team']],['sculpy_os_import_preview',['clients','[]']],['sculpy_os_update_client',[id(30),id(10),'bad','{}',true]]])await assert.rejects(()=>rpc(db,name,args));
  }
  await as(db,1);await assert.rejects(()=>db.exec('select * from sculpy_private.os32_commands'));await assert.rejects(()=>db.exec('select * from sculpy_private.os32_import_rows'));await assert.rejects(()=>rpc(db,'sculpy_private.os32_actor'));
  assert.equal((await rpc(db,'sculpy_os_task_context')).assignees.length,2);
 }finally{await db.close();}
});
test('V3.2 SQL: customer review/edit, private-contact conflict and idempotent retry',async()=>{
 const db=await createDatabase();try{
  await fixture(db);await as(db,1);const d=await clientDetail(db),f=fields();
  const review=await rpc(db,'sculpy_os_client_review',[id(10),d.revision,JSON.stringify(f)]);assert.equal(review.fields.phone,f.phone);
  await assert.rejects(()=>rpc(db,'sculpy_os_update_client',[id(30),id(10),d.revision,JSON.stringify(f),false]));
  const saved=await rpc(db,'sculpy_os_update_client',[id(30),id(10),d.revision,JSON.stringify(f),true]);assert.equal(saved.id,id(10));
  assert.equal((await rpc(db,'sculpy_os_update_client',[id(30),id(10),d.revision,JSON.stringify(f),true])).replayed,true);
  await as(db,2);const reread=await clientDetail(db);assert.equal(reread.contact.email,f.email);assert.deepEqual(reread.client.tags,['VIP']);
  await assert.rejects(()=>rpc(db,'sculpy_os_update_client',[id(31),id(10),d.revision,JSON.stringify(f),true]),e=>e.code==='40001');
  await assert.rejects(()=>rpc(db,'sculpy_os_update_client',[id(30),id(10),d.revision,JSON.stringify(f),true]),e=>e.code==='23505');
  await db.exec('reset role');await db.query("update client_private set email='other@example.test' where client_id=$1",[id(10)]);await as(db,1);
  await assert.rejects(()=>rpc(db,'sculpy_os_update_client',[id(32),id(10),reread.revision,JSON.stringify(f),true]),e=>e.code==='40001');
  await assert.rejects(async()=>rpc(db,'sculpy_os_client_review',[id(10),(await clientDetail(db)).revision,JSON.stringify({...f,wedding_date:'2027-02-30'})]));
 }finally{await db.close();}
});
test('V3.2 SQL: task assignment, mine/team filters, disabled targets and existing operations',async()=>{
 const db=await createDatabase();try{
  await fixture(db);await as(db,1);
  const args=[id(20),'Follow up','2026-12-01T12:00:00Z',id(2),null,id(10),true];
  await rpc(db,'sculpy_os_create_task_v32',args);assert.equal((await rpc(db,'sculpy_os_create_task_v32',args)).replayed,true);
  assert.equal((await rpc(db,'sculpy_os_tasks_v32',['open',0,'mine'])).total,0);
  await as(db,2);const list=await rpc(db,'sculpy_os_tasks_v32',['open',0,'mine']);assert.equal(list.total,1);
  await assert.rejects(()=>rpc(db,'sculpy_os_reassign_task',[id(30),id(20),list.tasks[0].edit_version,id(5),true]));
  await rpc(db,'sculpy_os_reassign_task',[id(30),id(20),list.tasks[0].edit_version,id(1),true]);
  assert.equal((await rpc(db,'sculpy_os_reassign_task',[id(30),id(20),list.tasks[0].edit_version,id(1),true])).replayed,true);
  await assert.rejects(()=>rpc(db,'sculpy_os_reassign_task',[id(31),id(20),list.tasks[0].edit_version,id(2),true]),e=>e.code==='40001');
  const t=(await rpc(db,'sculpy_os_tasks_v32',['open',0,'team'])).tasks[0];await rpc(db,'sculpy_os_update_task',[id(32),id(20),t.edit_version,'complete',null,true]);
  assert.equal((await rpc(db,'sculpy_os_tasks_v32',['done',0,'team'])).total,1);
 }finally{await db.close();}
});
test('V3.2 SQL: customer import is atomic, replayable and deduplicates files and batch aliases',async()=>{
 const db=await createDatabase();try{
  await fixture(db);await as(db,1);
  const a=customer(2),rows=[a,{...a,line:3,external_id:'AliasC2'}];let p=await preview(db,'clients',rows);
  assert.equal((await preview(db,'clients',[a,{...a,line:3,external_id:'DifferentTarget',client_choice:id(10)}])).ready,false);
  assert.equal(p.ready,true,JSON.stringify(p.rows));assert.equal(p.creates,1);assert.equal(p.skips,1);
  await assert.rejects(()=>commit(db,40,'clients',rows,p,false));const saved=await commit(db,40,'clients',rows,p);assert.equal(saved.rows[0].id,saved.rows[1].id);
  assert.equal((await commit(db,40,'clients',rows,p)).replayed,true);
  p=await preview(db,'clients',rows);assert.equal(p.creates,0);assert.equal(p.skips,2);await commit(db,41,'clients',rows,p);
  assert.equal((await preview(db,'clients',[{...a,client_choice:id(10)}])).ready,false);
  const changed=[{...a,email:'different@example.test'}];p=await preview(db,'clients',changed);assert.equal(p.ready,false);
  const invalid=[customer(4,'Would roll back'),{...customer(5,'Bad'),wedding_date:'2027-02-30'}];p=await preview(db,'clients',invalid);assert.equal(p.ready,false);await assert.rejects(()=>commit(db,42,'clients',invalid,p));
  const dup=[customer(6,'Existing')];p=await preview(db,'clients',dup);assert.equal(p.rows[0].action,'choose');
  dup[0].client_choice=id(10);p=await preview(db,'clients',dup);assert.equal(p.links,1);await commit(db,43,'clients',dup,p);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from clients')).rows[0].n,2);assert.equal((await db.query("select count(*)::int n from clients where display_name='Would roll back'")).rows[0].n,0);
 }finally{await db.close();}
});
test('V3.2 SQL: order import preserves unknown money, Toronto times, original numbers and financial ledgers',async()=>{
 const db=await createDatabase();try{
  await fixture(db);await as(db,1);const rows=[order()];let p=await preview(db,'orders',rows);assert.equal(p.ready,true,JSON.stringify(p.rows));
  assert.equal(p.rows[0].normalized.price,null);const saved=await commit(db,50,'orders',rows,p);const booking=saved.rows[0].id;
  assert.equal((await commit(db,50,'orders',rows,p)).replayed,true);
  p=await preview(db,'orders',rows);assert.equal(p.skips,1);await commit(db,51,'orders',rows,p);
  for(const bad of [{service_date:'06-21'},{start_time:''},{service_date:'2027-03-14',start_time:'02:30'},{service_date:'2027-11-07',start_time:'01:30'},{price:'$100'},{client_choice:''}]){
   const q=await preview(db,'orders',[{...order(3),...bad}]);assert.equal(q.ready,false,JSON.stringify(q));
  }
  assert.equal((await preview(db,'orders',[{...order(4),service_date:'2027-11-07',start_time:'01:30',utc_offset:'-04:00'}])).ready,true);
  await db.exec('reset role');const b=(await db.query('select * from bookings where id=$1',[booking])).rows[0];assert.match(b.order_number,/^6[01235678][012356789]{4}$/);assert.equal(b.price_cad,null);assert.equal(b.confirmed_at,null);
  assert.equal(new Date(b.starts_at).toISOString(),'2027-06-21T14:00:00.000Z');
  for(const table of ['payments','invoices'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
 }finally{await db.close();}
});
test('V3.2 SQL: changed preview and cross-actor receipt cannot commit',async()=>{
 const db=await createDatabase();try{
  await fixture(db);await as(db,1);const rows=[{...customer(2,'Existing'),client_choice:id(10)}],p=await preview(db,'clients',rows);
  await db.exec('reset role');await db.query("update clients set city='New city' where id=$1",[id(10)]);await as(db,1);
  await assert.rejects(()=>commit(db,60,'clients',rows,p),e=>e.code==='40001');const fresh=await preview(db,'clients',rows);await commit(db,61,'clients',rows,fresh);
  await as(db,2);await assert.rejects(()=>commit(db,61,'clients',rows,fresh),e=>e.code==='23505');
 }finally{await db.close();}
});
test('V3.2 SQL: failure during a batch rolls back earlier rows and receipts',async()=>{
 const db=await createDatabase();try{
  await fixture(db);await db.exec(`create function pg_temp.reject_fixture() returns trigger language plpgsql as $$begin if new.display_name='Fail second' then raise exception 'Fixture write failure' using errcode='22023';end if;return new;end$$;
   create trigger reject_fixture before insert on clients for each row execute function pg_temp.reject_fixture();`);
  await as(db,1);const rows=[customer(2,'First would save'),customer(3,'Fail second')],p=await preview(db,'clients',rows);assert.equal(p.ready,true);
  await assert.rejects(()=>commit(db,70,'clients',rows,p),e=>e.code==='22023');await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from clients where display_name in ('First would save','Fail second')")).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from sculpy_private.os32_import_rows')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from sculpy_private.os32_commands')).rows[0].n,0);
 }finally{await db.close();}
});
test('V3.2 SQL: concurrent client edits and import confirmations have one writer',{skip:!process.env.SCULPY_TEST_DATABASE_URL},async()=>{
 const db=await createDatabase();let a,b;try{
  await fixture(db);a=await db.connect();b=await db.connect();await as(a,1);await as(b,2);const d=await clientDetail(a);
  const edits=await Promise.allSettled([rpc(a,'sculpy_os_update_client',[id(80),id(10),d.revision,JSON.stringify({...fields(),city:'A'}),true]),rpc(b,'sculpy_os_update_client',[id(81),id(10),d.revision,JSON.stringify({...fields(),city:'B'}),true])]);
  assert.equal(edits.filter(x=>x.status==='fulfilled').length,1);assert.equal(edits.find(x=>x.status==='rejected').reason.code,'40001');
  const rows=[customer(2,'Concurrent import')],p=await preview(a,'clients',rows);
  const imports=await Promise.allSettled([commit(a,82,'clients',rows,p),commit(b,83,'clients',rows,p)]);
  assert.equal(imports.filter(x=>x.status==='fulfilled').length,1);assert.equal(imports.find(x=>x.status==='rejected').reason.code,'40001');
  await as(db,1);const second=await preview(db,'clients',rows);assert.equal(second.skips,1);
 }finally{await a?.end();await b?.end();await db.close();}
});
