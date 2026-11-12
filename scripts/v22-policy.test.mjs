import test from 'node:test';import assert from 'node:assert/strict';import {converse} from '../supabase/functions/sculpy-chat/core.ts';import {selectSkills,structuredIntent,skills} from '../supabase/functions/sculpy-chat/skills.js';import {readFileSync} from 'node:fs';
test('V2.2 Skills are runtime-loaded only when relevant and match maintained source files',()=>{
 assert.deepEqual(selectSkills('你好').map(s=>s.name),[]);
 assert(selectSkills('Google渠道ROI').some(s=>s.name==='growth'));
 assert(selectSkills('到账和利润').some(s=>s.name==='finance'));
 for(const [name,file]of Object.entries({business:'business-analysis',finance:'finance-advisor',growth:'growth-advisor'}))assert.equal(skills[name],readFileSync(new URL('../skills/sculpy-'+file+'/SKILL.md',import.meta.url),'utf8').split('---').slice(2).join('---').trim());
 assert(structuredIntent('记一下这个客户喜欢自然妆'));assert(!structuredIntent('先别修改'));assert(!structuredIntent('比较9月记录数和金额'));assert(!structuredIntent('课程的完成记录和金额是多少？'));
});
test('V2.2 conversational text is not forced to structured output; writes retain schema',async()=>{
 for(const [message,structured]of [['你好，聊两句',false],['帮我记录客户要求',true]]){
 const r=await converse({context:{bookings:[]},turns:[],message,preferences:{},rules:'',query:async()=>({}),callModel:async payload=>{assert.equal(Boolean(payload.text),structured);return {output_text:structured?JSON.stringify({answer:'请确认卡片',references:[],proposals:[]}):'今天想聊什么？'};}});assert(r.answer);assert.deepEqual(r.proposals,[]);
 }
});

 test('V2.2 comparisons use deterministic deltas and safe zero denominators',async()=>{const {compareDemoReports}=await import('../supabase/functions/sculpy-chat/demo-report.js');const a={filters:{from:'2026-09-01'},records:28,completed:21,completedAmountCents:1968500,grossReceivedCents:1372500},b={filters:{from:'2026-08-01'},records:34,completed:26,completedAmountCents:2602500,grossReceivedCents:2123500};const c=compareDemoReports(a,b);assert.equal(c.metrics.completedAmountCents.delta,-634000);assert.equal(c.metrics.completedAmountCents.percent,-24.4);assert.equal(c.metrics.grossReceivedCents.delta,-751000);assert.equal(compareDemoReports(a,{...b,records:0}).metrics.records.percent,null);});
