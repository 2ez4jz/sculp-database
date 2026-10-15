import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisPeriods,analysisPeriodInstructions,catalogHistoryFrom} from '../supabase/functions/sculpy-chat/period-policy.js';
import {converse,instructions} from '../supabase/functions/sculpy-chat/core.ts';
const date='2026-10-15',from='2025-02-01',history=[{user:'哪个场地客单价最高',answer:'最近30天Liberty Grand最高。',demoReportSources:[{filters:{from:'2026-09-15',to:'2026-10-14',service:'Wedding',groupBy:'venue'}}]}];
test('long-term follow-up and unscoped ranking directly compare year and all recorded history',()=>{
 for(const [q,turns]of [['长期来看',history],['从长远来看呢',history],['long term?',history],['哪个场地客单价最高',[]],['今年和所有历史都给我',history]])assert.deepEqual(analysisPeriods(q,turns,date,from),{year:{from:'2026-01-01',to:date},history:{from,to:date}});
 for(const q of ['今年最高的是哪个','只看2025年','过去30天','只看所有历史'])assert.equal(analysisPeriods(q,history,date,from),null);
 for(const q of ['前三名呢','用柱状图看看','你好'])assert.equal(analysisPeriods(q,history,date,from),null);
 assert.equal(analysisPeriods('长期来看',[],date,from),null);
});
test('history range uses the full catalog and excludes invalid and future dates',()=>{
 assert.equal(catalogHistoryFrom([{date:'2026-10-01'},{date:'2024-02-29',paidDate:'2024-02-01'},{date:'2023-02-29'},{date:'2027-01-01'}],date),'2024-02-01');
 assert.equal(catalogHistoryFrom([],date),'2026-01-01');
 assert.equal(analysisPeriods('哪个场地客单价最高',[],date,'bad'),null);
});
test('legacy path receives explicit dual-period instructions, preserves same-year cases and access limits',async()=>{
 const context={localDate:date,historyFrom:'2026-01-01',bookings:[]};
 assert.match(analysisPeriodInstructions('长期来看',history,context),/两组相同也明确写两组/);
 assert.equal(analysisPeriodInstructions('长期来看',history,{localDate:date}), '');
 await converse({context,turns:history,message:'长期来看',preferences:{},rules:'',query:async()=>({}),callModel:async payload=>{assert.match(payload.instructions,/不询问用户想看今年还是历史/);assert.match(payload.instructions,/只替换时间/);return {output_text:'今年和全部已记录历史均需核对。'};}});
});

test('brief price analysis distinguishes spending signals from wealth and future venue reference costs',()=>{
 assert.match(instructions,/预算或支付意愿较高的信号/);assert.match(instructions,/不能直接断言客户收入、资产/);assert.match(instructions,/不能当客户实际支出或本店实际成本/);assert.match(instructions,/明确只要数字时省略/);
});
