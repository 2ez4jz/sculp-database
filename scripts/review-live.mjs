// Explicit, bounded live check. Uses only fictional demo records and the
// deployed public endpoint; never reads a key or writes production records.
import {bookings} from '../src/data/demo.js';
import {advisorRowsFromBookings,advisorSnapshot} from '../src/domain/demo-workspace.js';
import {demoReport} from '../supabase/functions/sculpy-chat/demo-report.js';
import {config} from '../src/config.js';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=advisorSnapshot(advisorRowsFromBookings(bookings));
const cases=[
 {name:'sdk-two-month-comparison',message:'比较2026年8月和9月已完成订单金额、到账原额，各自查询后解释变化。',preferences:{verbosity:'balanced',instructions:'请用中文回复。'},engine:'sdk',minimumReports:2},
 {name:'sdk-english',message:'Compare completed booking value in August 2026 and September 2026. Explain briefly in English.',preferences:{verbosity:'brief',instructions:'Please respond in English.'},engine:'sdk',minimumReports:2,english:true},
 {name:'sdk-exact-cutoff',message:'2026年10月1日至10月10日的经营日报，给完成金额和到账原额并提一条核对建议。',engine:'sdk',minimumReports:1,cutoff:'2026-10-10'},
 {name:'legacy-visual-with-analysis',message:'9月各渠道收款金额饼图，并解释结构、给一条核对建议。',agentMode:undefined,engine:'legacy',minimumReports:1},
 {name:'scoped-order-stays-legacy',message:'这笔订单的服务日期是什么？',bookingId:bookings[0].id,engine:'legacy'},
 {name:'ordinary-query-stays-legacy',message:'你现在能做什么？用两句话介绍。',engine:'legacy'},
];
const output=[];
for(const c of cases){
 const started=Date.now();
 const response=await fetch(config.supabaseUrl+'/functions/v1/sculpy-chat',{method:'POST',headers:{origin:'https://2ez4jz.github.io','content-type':'application/json'},body:JSON.stringify({mode:'demo',agentMode:Object.hasOwn(c,'agentMode')?c.agentMode:'sdk',requestId:crypto.randomUUID(),message:c.message,bookingId:c.bookingId||null,catalog:{bookings,notes:[]},advisorFixture:fixture,preferences:c.preferences||{verbosity:'brief',instructions:'请用中文回复。'}}),signal:AbortSignal.timeout(180000)});
 const data=await response.json();
 const record={name:c.name,status:response.status,ms:Date.now()-started,...data};output.push(record);
 assert.equal(response.status,200,JSON.stringify(record));assert.equal(data.turn.engine,c.engine,JSON.stringify(record));assert(!data.turn.agentFallback,'SDK live trial must actually execute SDK');
 if(c.minimumReports){assert(data.turn.demoReportSources?.length>=c.minimumReports);for(const source of data.turn.demoReportSources){const expected=demoReport(bookings,source.filters,source.asOfDate);for(const metric of ['records','completedAmountCents','grossReceivedCents'])assert.equal(source[metric],expected[metric]);}}
 if(c.cutoff)assert(data.turn.demoReportSources.every(s=>s.filters.to===c.cutoff));
 if(c.name==='legacy-visual-with-analysis')assert.match(data.turn.answer,/建议|核对/);
 if(c.english)assert(!/\p{Script=Han}/u.test(data.turn.answer),'English preference was ignored');
 console.log(c.name+': '+data.turn.engine+', '+(data.turn.demoReportSources?.length||0)+' reports, '+record.ms+'ms');
}
const unauthorized=await fetch(config.supabaseUrl+'/functions/v1/sculpy-chat',{method:'POST',headers:{origin:'https://2ez4jz.github.io','content-type':'application/json'},body:JSON.stringify({mode:'cloud',action:'history'})});
assert.equal(unauthorized.status,401);output.push({name:'unauthenticated-cloud-history',status:401});
await writeFile(new URL('../docs/evaluations/sculpy-review-20261014-live.json',import.meta.url),JSON.stringify({fictionalOnly:true,at:new Date().toISOString(),cases:output},null,2)+'\n');
console.log('All bounded live review checks passed');
