import {bookings,venues} from '../src/data/demo.js';
import {advisorRowsFromBookings,advisorSnapshot} from '../src/domain/demo-workspace.js';
import {demoReport,compactDemoReport} from '../supabase/functions/sculpy-chat/demo-report.js';
import {catalogHistoryFrom,analysisPeriods} from '../supabase/functions/sculpy-chat/period-policy.js';
import {mkdir,writeFile} from 'node:fs/promises';
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const standard=bookings.map(b=>({...b,venueName:venues.find(v=>v.id===b.venueId)?.name}));
const filters={from:'2026-09-15',to:'2026-10-14',service:'Wedding',venueId:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:'venue'};
const prior=[{user:'哪个场地客单价最高',answer:'沿用最近30天，Liberty Grand最高。',sourceIds:[],demoReportSources:[compactDemoReport(demoReport(standard,filters,day))]}];
const multi=[...standard,{...standard.find(b=>b.service==='Wedding'),id:'dual-period-2025-example',date:'2025-02-01',paidDate:'2025-02-01',status:'Completed',venueId:'casa',venueName:'Casa Loma',price:10000,paidCents:1000000}];
const cases=[
 {id:'screenshot-followup',message:'长期来看',turns:prior,rows:standard},
 {id:'fresh-ranking',message:'哪个场地婚礼客单价最高',turns:[],rows:standard},
 {id:'multi-year-distinction',message:'长期来看',turns:prior,rows:multi},
 {id:'explicit-month',message:'只看2026年8月，哪个场地婚礼客单价最高',turns:prior,rows:standard,explicit:true},
 {id:'legacy-followup',message:'长期来看',turns:prior,rows:standard,legacy:true}
];
const results=[];
async function run(c){
 const started=Date.now(),response=await fetch('https://lztzzdhqghwubygpzcbq.supabase.co/functions/v1/sculpy-chat',{method:'POST',headers:{origin:'https://2ez4jz.github.io','content-type':'application/json'},body:JSON.stringify({mode:'demo',agentMode:c.legacy?undefined:'sdk',requestId:crypto.randomUUID(),message:c.message,catalog:{bookings:c.rows,notes:[]},advisorFixture:advisorSnapshot(advisorRowsFromBookings(c.rows)),turns:c.turns,preferences:{verbosity:'balanced',instructions:'请用中文回复。'}}),signal:AbortSignal.timeout(180000)});
 const data=await response.json(),errors=[],sources=data.turn?.demoReportSources||[];
 if(response.status!==200)errors.push('HTTP '+response.status);
 if(data.turn?.agentFallback)errors.push('unexpected fallback');
 if(!c.explicit){const periods=analysisPeriods(c.message,c.turns,day,catalogHistoryFrom(c.rows,day));for(const p of Object.values(periods))if(!sources.some(s=>s.filters.from===p.from&&s.filters.to===p.to&&s.filters.service==='Wedding'))errors.push('missing period '+JSON.stringify(p));if(!/今年|2026/.test(data.turn?.answer||'')||!/历史/.test(data.turn?.answer||''))errors.push('missing dual labels');if(/你想看|你是想|还是所有|还是全部|请选择/.test(data.turn?.answer||''))errors.push('unwanted clarification');}
 else if(!sources.length||sources.some(s=>s.filters.from!=='2026-08-01'||s.filters.to!=='2026-08-31'))errors.push('explicit month overridden');
 for(const s of sources){const expected=demoReport(c.rows,s.filters,s.asOfDate);for(const key of ['records','pricedCompleted','averageCompletedAmountCents','completedAmountCents'])if(s[key]!==expected[key])errors.push(key+' mismatch');}
 if(c.id==='multi-year-distinction'&&(!data.turn.answer.includes('SCULP Studio')||!data.turn.answer.includes('Casa Loma')))errors.push('missing distinct winners');
 results.push({id:c.id,message:c.message,status:response.status,ms:Date.now()-started,errors,...data});
 await mkdir('docs/evaluations',{recursive:true});await writeFile('docs/evaluations/dual-period-20261015-v30.json',JSON.stringify({at:new Date().toISOString(),fictionalOnly:true,edgeVersion:30,results},null,2));
 console.log(c.id,response.status,JSON.stringify(errors),'\n'+data.turn?.answer);
}
for(let i=0;i<cases.length;i+=2)await Promise.all(cases.slice(i,i+2).map(run));
if(results.some(r=>r.errors.length))process.exitCode=1;
