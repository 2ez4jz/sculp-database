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

test('Marketing module filters posts and opens escaped details', () => {
  const dom=new JSDOM('<section id="root"></section>');
  const root=dom.window.document.querySelector('#root');
  mountMarketingPlan(root);
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
  assert.match(root.querySelector('[data-marketing-progress]').textContent,/1\/9 已完成/);
  assert.equal(root.querySelector('.marketing-caption').querySelector('script'),null);
  root.querySelector('[data-marketing-close]').click();
  assert.equal(root.querySelector('[data-marketing-detail]').hidden,true);
});
