import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {holidayContentPlan, mountMarketingPlan} from '../src/pages/login/marketing-plan.js';

test('Holiday content plan contains 24 distinct, dated posts over four weeks', () => {
  assert.equal(holidayContentPlan.length,24);
  assert.equal(new Set(holidayContentPlan.map(p=>p.date+'-'+p.platform)).size,24);
  assert.equal(holidayContentPlan.filter(p=>p.platform==='Instagram').length,12);
  assert.equal(holidayContentPlan.filter(p=>p.platform==='小红书').length,12);
  assert.equal(holidayContentPlan.filter(p=>p.category==='Holiday').length,8);
  for(const post of holidayContentPlan){assert.ok(post.caption.length>100);assert.ok(post.visual);assert.ok(post.cover);}
});

test('Marketing module filters posts and opens escaped details', () => {
  const dom=new JSDOM('<section id="root"></section>');
  const root=dom.window.document.querySelector('#root');
  mountMarketingPlan(root);
  assert.equal(root.querySelectorAll('[data-post]').length,6);
  root.querySelector('[data-marketing-platform]').value='小红书';
  root.querySelector('[data-marketing-platform]').dispatchEvent(new dom.window.Event('change'));
  assert.equal(root.querySelectorAll('[data-post]').length,3);
  root.querySelector('[data-post="2"]').click();
  assert.equal(root.querySelector('[data-marketing-detail]').hidden,false);
  assert.match(root.querySelector('.marketing-caption').textContent,/150 CAD/);
  assert.equal(root.querySelector('.marketing-caption').querySelector('script'),null);
  root.querySelector('[data-marketing-close]').click();
  assert.equal(root.querySelector('[data-marketing-detail]').hidden,true);
});
