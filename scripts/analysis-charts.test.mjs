import test from 'node:test';
import assert from 'node:assert/strict';
import {bookings} from '../src/data/demo.js';
import {demoReport} from '../supabase/functions/sculpy-chat/demo-report.js';
import {buildAnalysisCharts,renderAnalysisCharts} from '../src/components/analysis/charts.js';
const day='2026-10-11';
const args={from:'2026-09-01',to:'2026-09-30',service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:null};
const report=patch=>demoReport(bookings,{...args,...patch},day);
const build=(message,reports=[],extra={})=>buildAnalysisCharts({message,bookings,reports,day,...extra});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('automatic daily charts use exact full catalog figures and distinguish value from receipt dates',()=>{
 const source=report({from:'2026-10-01',to:'2026-10-10'});
 const charts=build('出截至10月10日的日报',[source]);
 assert(charts.some(c=>c.title==='status'));assert(charts.some(c=>c.kind==='donut'));
 const finance=charts.find(c=>c.title==='finance');assert.deepEqual(finance.rows.map(r=>r.value),[507000,442500]);
 assert(charts.every(c=>c.from==='2026-10-01'&&c.to==='2026-10-10'));
 const mix=charts.find(c=>c.kind==='donut');assert.equal(mix.rows.reduce((n,r)=>n+r.value,0),7);
});
test('pie request inherits the previous exact intersection and never expands to the whole fixture',()=>{
 const previous=report({service:'Wedding',channelId:'instagram'});
 const chart=build('用饼图看看',[],{previousReports:[previous]})[0];
 assert.equal(chart.filters.service,'Wedding');assert.equal(chart.filters.channelId,'instagram');assert.equal(chart.from,args.from);
 assert.equal(chart.rows.reduce((n,r)=>n+r.value,0),3);
});
test('financial composition uses completed cents and calendar ranges anchored to supplied Toronto day',()=>{
 const pie=build('9月各服务收入饼图')[0];assert.equal(pie.from,'2026-09-01');assert.equal(pie.to,'2026-09-30');
 assert.equal(pie.rows.reduce((n,r)=>n+r.value,0),report().completedAmountCents);
 assert.equal(build('本月服务收入饼图')[0].to,day);
});
test('many artists choose readable bars, service composition chooses a donut, no ordinary chat decoration',()=>{
 assert.equal(build('300单化妆师订单占比')[0].kind,'bars');
 assert.equal(build('300单服务订单占比')[0].kind,'donut');
 assert.deepEqual(build('你好'),[]);
});
test('different channel intersections compare together without implying revenue equals order count',()=>{
 const sources=['google','instagram'].map(channelId=>report({service:'Wedding',channelId}));
 const count=build('对比Google和Instagram婚礼订单',sources)[0];assert.equal(count.title,'comparison');assert.deepEqual(count.rows.map(r=>r.value),[2,3]);
 const money=build('对比Google和Instagram婚礼金额',sources)[0];assert.deepEqual(money.rows.map(r=>r.value),[326000,173000]);assert.deepEqual(money.rows.map(r=>r.secondary),[161000,173000]);
});
test('same filter across periods chooses sorted trend with exact date metadata; unrelated filters do not',()=>{
 const charts=build('9月和8月收入对比',[report(),report({from:'2026-08-01',to:'2026-08-31'})]);
 assert.equal(charts[0].kind,'trend');assert.equal(charts[0].from,'2026-08-01');assert.equal(charts[0].to,'2026-09-30');
 assert(!build('对比',[report(),report({from:'2026-08-01',to:'2026-08-31',service:'Wedding'})]).some(c=>c.kind==='trend'));
});
test('unknown prices, empty periods and future completion get explicit labels without fabricated values',()=>{
 const modified=structuredClone(bookings);modified.find(b=>b.id==='b157').price=null;
 const source=report({from:'2026-10-10',to:'2026-10-10'});
 const charts=build('今日收入饼图',[source],{bookings:modified});
 const html=renderAnalysisCharts(charts,esc);assert.match(html,/金额不完整/);assert.match(html,/没有可绘制/);assert.match(html,/样本少/);
 assert.match(renderAnalysisCharts(build('300单收入饼图'),esc),/未来日期完成状态/);
 assert.match(renderAnalysisCharts(build('2030-01-01收入饼图'),esc),/没有可绘制/);
 assert.deepEqual(build('2026-02-30收入饼图'),[]);
});
test('schedule uses existing local times and labels unknown times rather than inventing a duration',()=>{
 const rows=[{...bookings[0],date:'2026-09-02',status:'Confirmed',startTime:'09:00',endTime:'11:00'}, {...bookings[1],date:'2026-09-02',status:'Inquiry',startTime:null,endTime:null}];
 const charts=build('9月排期',[],{bookings:rows});assert.equal(charts[0].kind,'schedule');assert.equal(charts[0].rows[0].time,'09:00–11:00');
 const html=renderAnalysisCharts(charts,esc);assert.match(html,/时间待确认/);assert.match(html,/咨询中/);assert.match(html,/多伦多/);
});
test('rendering escapes labels, rejects invalid numeric values and supports English',()=>{
 const chart=build('300单订单占比')[0];chart.rows=[{label:'<script>',value:1},{label:'bad',value:NaN},{label:'negative',value:-1}];
 const html=renderAnalysisCharts([chart],esc,true);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('NaN'));assert.match(html,/fictional/);
});

test('receipt composition uses receipt dates and its own metric label',()=>{
 const chart=build('9月各渠道收款金额饼图')[0];
 assert.equal(chart.metric,'grossReceivedCents');assert.equal(chart.rows.reduce((n,r)=>n+r.value,0),report().grossReceivedCents);
 assert.match(renderAnalysisCharts([chart],esc),/到账原额 · CAD/);
});
