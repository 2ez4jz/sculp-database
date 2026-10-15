// Only inline invented test data is transmitted to the verified SCULPY project.
// No local catalog, customer records, saved conversations or credentials are read.
import {mkdir,writeFile} from 'node:fs/promises';
const endpoint='https://lztzzdhqghwubygpzcbq.supabase.co/functions/v1/sculpy-chat';
const base={service:'Wedding',status:'Completed',artistIds:['synthetic-artist'],channelId:'synthetic-channel',paidCents:0};
const rows=[{...base,id:'synthetic-1',venueId:'synthetic-a',venueName:'Synthetic Venue A',date:'2026-08-01',price:1000},{...base,id:'synthetic-2',venueId:'synthetic-b',venueName:'Synthetic Venue B',date:'2026-08-05',price:500},{...base,id:'synthetic-3',venueId:'synthetic-b',venueName:'Synthetic Venue B',date:'2025-02-01',price:10000}];
const filters={from:'2026-09-15',to:'2026-10-14',service:'Wedding',venueId:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:'venue'};
const seed=[{user:'哪个场地婚礼客单价最高',answer:'此前只看了最近30天。',sourceIds:[],demoReportSources:[{filters}]}];
const results=[];
for(const c of [{id:'screenshot-followup',message:'长期来看',turns:seed},{id:'fresh-ranking',message:'哪个场地婚礼客单价最高',turns:[]},{id:'explicit-month',message:'只看2026年8月，哪个场地婚礼客单价最高',turns:seed,explicit:true},{id:'legacy-followup',message:'长期来看',turns:seed,legacy:true}]){
 const response=await fetch(endpoint,{method:'POST',headers:{origin:'https://2ez4jz.github.io','content-type':'application/json'},body:JSON.stringify({mode:'demo',agentMode:c.legacy?undefined:'sdk',requestId:crypto.randomUUID(),message:c.message,catalog:{bookings:rows,notes:[]},advisorFixture:{version:'sculp-unified-300-v2',fictional:true,summary:{}},turns:c.turns,preferences:{verbosity:'balanced',instructions:'请用中文回复。'}}),signal:AbortSignal.timeout(180000)});
 const data=await response.json(),sources=data.turn?.demoReportSources||[],errors=[];
 if(response.status!==200)errors.push('HTTP '+response.status);
 if(data.turn?.agentFallback)errors.push('unexpected fallback');
 if(c.explicit){if(!sources.length||sources.some(s=>s.filters.from!=='2026-08-01'||s.filters.to!=='2026-08-31'))errors.push('explicit month overridden');}
 else{
  for(const from of ['2026-01-01','2025-02-01'])if(!sources.some(s=>s.filters.from===from&&s.filters.to==='2026-10-15'&&s.filters.service==='Wedding'))errors.push('missing range '+from);
  if(!data.turn?.answer.includes('Synthetic Venue A')||!data.turn?.answer.includes('Synthetic Venue B'))errors.push('missing distinct winners');
  if(/你想看|你是想|还是所有|还是全部|请选择/.test(data.turn?.answer||''))errors.push('clarification instead of direct answer');
 }
 results.push({id:c.id,message:c.message,status:response.status,errors,...data});
 await mkdir('docs/evaluations',{recursive:true});await writeFile('docs/evaluations/dual-period-synthetic-20261015-v31.json',JSON.stringify({fictionalOnly:true,inlineSyntheticRows:3,edgeVersion:31,results},null,2));
 console.log(c.id,response.status,JSON.stringify(errors),'\n'+data.turn?.answer);
}
if(results.some(r=>r.errors.length))process.exitCode=1;
