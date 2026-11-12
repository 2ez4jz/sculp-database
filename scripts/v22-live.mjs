import {scenarios} from './v22-cases.mjs';
import {bookings} from '../src/data/demo.js';
import {advisorRowsFromBookings,advisorSnapshot} from '../src/domain/demo-workspace.js';
import {demoReport} from '../supabase/functions/sculpy-chat/demo-report.js';
import {config} from '../src/config.js';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
const version=process.argv[2]||'baseline',fixture=advisorSnapshot(advisorRowsFromBookings(bookings));
const path=new URL('../docs/evaluations/v22-'+version+'.json',import.meta.url);
await mkdir(new URL('../docs/evaluations/',import.meta.url),{recursive:true});
let results=[];try{results=JSON.parse(await readFile(path,'utf8')).scenarios||[];}catch{}
for(const scenario of scenarios){
 if(results.some(r=>r.id===scenario.id&&r.turns.length===scenario.messages.length&&r.turns.every(t=>t.status===200)))continue;
 const turns=[],entry={...scenario,turns:[]};
 for(const message of scenario.messages){
  let response,data,started;
  for(let retry=0;retry<4;retry++){
   started=Date.now();
   try{response=await fetch(config.supabaseUrl+'/functions/v1/sculpy-chat',{method:'POST',headers:{origin:'https://2ez4jz.github.io','content-type':'application/json'},body:JSON.stringify({mode:'demo',agentMode:version==='baseline'?undefined:'sdk',requestId:crypto.randomUUID(),message,catalog:{bookings,notes:[]},advisorFixture:fixture,turns,preferences:{verbosity:'balanced',instructions:'按用户本轮语言回答。'}}),signal:AbortSignal.timeout(180000)});data=await response.json();}catch(e){data={error:e.message};response={status:0};}
   if(response.status!==429&&response.status!==0)break;
   console.log('retry',scenario.id,response.status);await new Promise(r=>setTimeout(r,45000));
  }
  const errors=[];for(const source of data.turn?.demoReportSources||[]){const expected=demoReport(bookings,source.filters,source.asOfDate);for(const metric of ['records','completedAmountCents','grossReceivedCents'])if(source[metric]!==expected[metric])errors.push(metric+' mismatch');}
  entry.turns.push({message,status:response.status,ms:Date.now()-started,...data,reportValidationErrors:errors});if(data.turn)turns.push(data.turn);
  console.log(version,scenario.id,entry.turns.length,response.status,data.turn?.engine,data.turn?.answer?.slice(0,70));
 }
 results=results.filter(r=>r.id!==scenario.id);results.push(entry);await writeFile(path,JSON.stringify({version,fictionalOnly:true,at:new Date().toISOString(),scenarios:results},null,2));
}
