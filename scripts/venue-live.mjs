import {bookings,venues} from '../src/data/demo.js';
import {advisorRowsFromBookings,advisorSnapshot} from '../src/domain/demo-workspace.js';
import {demoReport} from '../supabase/functions/sculpy-chat/demo-report.js';
import {mkdir,writeFile} from 'node:fs/promises';
const cases=[
 ['venue-average',['哪个场地婚礼客单价最高','前三名列个表，附订单数和平均客单价']],
 ['venue-chart',['今年截至今天，各场地已完成婚礼的平均客单价是多少','用柱状图看看']],
 ['venue-filter',['2026年8月Graydon Hall的婚礼完成金额和平均客单价是多少','换成9月，同口径比较变化']],
 ['channel-average',['今年截至今天，哪个渠道的婚礼平均客单价最高','订单最多的渠道和客单价最高的是同一个吗']],
 ['artist-average',['今年截至今天，各主负责人已完成婚礼的平均客单价排名','均价最高就说明她最赚钱吗']],
 ['empty-and-context',['2020年各场地婚礼平均客单价最高的是哪个','改看今年截至今天，并列的也列出来']]
];
const catalog={bookings:bookings.map(b=>({...b,venueName:venues.find(v=>v.id===b.venueId)?.name})),notes:[]},fixture=advisorSnapshot(advisorRowsFromBookings(bookings));
const results=[],edgeVersion=Number(process.env.SCULPY_EVAL_EDGE_VERSION||'29');
async function run([id,messages]){
 const turns=[],entry={id,turns:[]};
 for(const message of messages){
  const started=Date.now();
  const response=await fetch('https://lztzzdhqghwubygpzcbq.supabase.co/functions/v1/sculpy-chat',{method:'POST',headers:{origin:'https://2ez4jz.github.io','content-type':'application/json'},body:JSON.stringify({mode:'demo',agentMode:'sdk',requestId:crypto.randomUUID(),message,catalog,advisorFixture:fixture,turns,preferences:{verbosity:'balanced',instructions:'请用中文回复。'}}),signal:AbortSignal.timeout(180000)});
  const data=await response.json(),errors=[];
  if(response.status!==200)errors.push('HTTP '+response.status);
  if(data.turn?.agentFallback)errors.push('unexpected fallback');
  if(!data.turn?.modelProfile?.model)errors.push('missing model metadata');
  for(const source of data.turn?.demoReportSources||[]){
   const expected=demoReport(catalog.bookings,source.filters,source.asOfDate);
   for(const key of ['records','completedAmountCents','grossReceivedCents','pricedCompleted','averageCompletedAmountCents'])if(source[key]!==expected[key])errors.push(key+' mismatch');
  }
  if(id==='venue-average'&&turns.length===0){
   const sources=data.turn?.demoReportSources||[];
   const source=sources.find(r=>r.filters?.groupBy==='venue'&&r.filters?.service==='Wedding');
   if(!source)errors.push('missing exact venue wedding report');
   else {const expected=demoReport(catalog.bookings,source.filters,source.asOfDate);for(const leader of expected.rankings.averageCompletedAmountCents.leaders){if(!data.turn.answer.includes(leader.label))errors.push('missing venue name '+leader.label);}}
  }
  entry.turns.push({message,status:response.status,ms:Date.now()-started,errors,...data});
  if(data.turn)turns.push(data.turn);
  console.log(id,entry.turns.length,response.status,data.turn?.engine,JSON.stringify(errors),data.turn?.answer?.slice(0,230));
 }
 results.push(entry);
 await mkdir('docs/evaluations',{recursive:true});
 await writeFile(`docs/evaluations/venue-model-dates-20261015-v${edgeVersion}.json`,JSON.stringify({at:new Date().toISOString(),fictionalOnly:true,edgeVersion,scenarios:results},null,2));
}
for(let i=0;i<cases.length;i+=2)await Promise.all(cases.slice(i,i+2).map(run));
if(results.some(r=>r.turns.some(t=>t.errors.length)))process.exitCode=1;
