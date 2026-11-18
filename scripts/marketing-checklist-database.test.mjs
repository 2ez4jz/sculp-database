import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './support/cloud-database.mjs';

const uid=n=>`39000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function actor(db,n,role='authenticated'){
  await db.exec('reset role;set role '+role);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);
}
test('marketing checklist and comments enforce owner/operations permissions and preserve mentions',async()=>{
  const db=await createDatabase();
  try{
    await db.exec('reset role');
    for(const [n,role] of [[1,'operations'],[2,'owner'],[3,'artist']]){
      await db.query('insert into auth.users(id) values($1)',[uid(n)]);
      await db.query('insert into public.profiles(id,display_name,role,active) values($1,$2,$3,true)',[uid(n),role,role]);
    }
    await actor(db,1);
    const changed=await db.query('select public.sculpy_marketing_set_check(2,0,true) result');
    assert.equal(changed.rows[0].result.checked,true);
    const comment=await db.query("select public.sculpy_marketing_add_comment(2,0,'请确认这张海报',$1) result",[uid(2)]);
    assert.equal(comment.rows[0].result.mentionedUserId,uid(2));
    assert.equal(comment.rows[0].result.notificationQueued,false); // no subscribed device
    await actor(db,2);
    const visible=await db.query('select checked from public.marketing_checklist_state where post_id=2 and task_index=0');
    assert.equal(visible.rows[0].checked,true);
    assert.equal((await db.query('select count(*)::int n from public.marketing_task_comments')).rows[0].n,1);
    await db.query('select public.sculpy_marketing_set_check(2,0,false)');
    await actor(db,3);
    assert.equal((await db.query('select count(*)::int n from public.marketing_checklist_state')).rows[0].n,0);
    await assert.rejects(()=>db.query('select public.sculpy_marketing_set_check(2,0,true)'));
    await assert.rejects(()=>db.query("select public.sculpy_marketing_add_comment(2,0,'No permission',null)"));
    await actor(db,1);
    await assert.rejects(()=>db.query("select public.sculpy_marketing_add_comment(2,0,'Self ping',$1)",[uid(1)]));
  }finally{await db.close();}
});
