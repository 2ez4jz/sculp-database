import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {holidayContentPlan, marketingProductionTasks, mountMarketingPlan} from '../src/pages/login/marketing-plan.js';

test('Holiday content plan contains 24 distinct, dated posts over four weeks', () => {
  assert.equal(holidayContentPlan.length,24);
  assert.equal(new Set(holidayContentPlan.map(p=>p.date+'-'+p.platform)).size,24);
  assert.equal(holidayContentPlan.filter(p=>p.platform==='Instagram').length,12);
  assert.equal(holidayContentPlan.filter(p=>p.platform==='小红书').length,12);
  assert.equal(holidayContentPlan.filter(p=>p.category==='Holiday').length,8);
  for(const post of holidayContentPlan){assert.ok(post.caption.length>100);assert.ok(post.visual);assert.ok(post.cover);}
  assert.equal(marketingProductionTasks.length,24);
  assert.equal(marketingProductionTasks[1].assets.length,4);
  assert.equal(marketingProductionTasks[8].assets.length,5);
  assert.equal(marketingProductionTasks[13].assets.length,6);
});

test('Marketing module filters posts, opens details and writes shared checks', async () => {
  const dom=new JSDOM('<section id="root"></section>');
  const root=dom.window.document.querySelector('#root');
  const mock={
    from(table){return {select(){return {eq(){
      if(table==='marketing_checklist_state')return Promise.resolve({data:[],error:null});
      return {order(){return {limit(){return Promise.resolve({data:[],error:null});}};}};
    }};}};},
    async rpc(name,args){if(name==='sculpy_os_task_context')return {data:{assignees:[{id:'u1',name:'JZ'},{id:'u2',name:'Miranda'}]},error:null};if(name==='sculpy_marketing_set_check')return {data:{checked:args.p_checked},error:null};return {data:{id:'c1',postId:args.p_post_id,taskIndex:args.p_task_index,body:args.p_body,authorId:'u1',mentionedUserId:args.p_mentioned_user,createdAt:'2026-11-18T20:00:00Z',notificationQueued:true},error:null};}
  };
  const mounted=mountMarketingPlan(root,{id:'u1'},mock);
  await new Promise(resolve=>setTimeout(resolve,0));
  await mounted.refresh();
  assert.equal(root.querySelectorAll('[data-post]').length,6);
  assert.equal(root.querySelectorAll('.marketing-day').length,7);
  root.querySelector('[data-marketing-platform]').value='小红书';
  root.querySelector('[data-marketing-platform]').dispatchEvent(new dom.window.Event('change'));
  assert.equal(root.querySelectorAll('[data-post]').length,3);
  root.querySelector('[data-post="2"]').click();
  assert.equal(root.querySelector('[data-marketing-detail]').hidden,false);
  assert.match(root.querySelector('.marketing-caption').textContent,/150 CAD/);
  assert.equal(root.querySelectorAll('.marketing-assets li').length,4);
  const check=root.querySelector('[data-check="0"]');
  check.checked=true;
  check.dispatchEvent(new dom.window.Event('change'));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(root.querySelector('[data-marketing-progress]').textContent,/1\/12 已完成/);
  const form=root.querySelector('[data-comment-form="0"]');
  form.elements.body.value='请 Miranda 看一下';form.elements.mention.value='u2';
  form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(root.querySelector('.marketing-task-comments').textContent,/请 Miranda 看一下/);
  assert.match(root.querySelector('[data-comment-status]').textContent,/已加入推送队列/);
  assert.equal(root.querySelector('.marketing-caption').querySelector('script'),null);
  root.querySelector('[data-marketing-close]').click();
  assert.equal(root.querySelector('[data-marketing-detail]').hidden,true);
});
