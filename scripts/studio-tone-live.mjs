// Inline invented test orders only; no local catalog/customer/conversation files are read.
import {mkdir,writeFile} from 'node:fs/promises';
const rows=[];
for(const year of [2025,2026])for(const venue of ['a','b'])for(let i=1;i<=8;i++)rows.push({id:`invented-${year}-${venue}-${i}`,date:`${year}-08-${String(i).padStart(2,'0')}`,service:'Wedding',status:'Completed',venueId:'invented-'+venue,venueName:'测试场地'+venue.toUpperCase(),price:venue==='a'?2000:1000,artistIds:['invented-artist'],channelId:'invented-source',details:'虚构例子：同样一个新娘、同样四小时的标准套餐，没有加人或加时。'});
const results=[];
for(const [id,message]of [['accurate-plain-concept','客单价是啥？说人话，顺便说一下和收款有什么区别。'],['direct-opportunity','哪个场地婚礼客单价最高？直接告诉我这钱有没有机会赚，先做什么。']]){
 const response=await fetch('https://lztzzdhqghwubygpzcbq.supabase.co/functions/v1/sculpy-chat',{method:'POST',headers:{origin:'https://2ez4jz.github.io','content-type':'application/json'},body:JSON.stringify({mode:'demo',agentMode:'sdk',requestId:crypto.randomUUID(),message,catalog:{bookings:rows,notes:[]},advisorFixture:{version:'sculp-unified-300-v2',fictional:true,summary:{}},turns:[],preferences:{verbosity:'balanced',instructions:'请用中文回复。'}}),signal:AbortSignal.timeout(180000)});
 const data=await response.json(),errors=[];
 if(response.status!==200)errors.push('HTTP '+response.status);
 if(data.turn?.agentFallback)errors.push('unexpected fallback');
 if(id==='accurate-plain-concept'&&data.turn?.demoReportSources?.length)errors.push('unnecessary report');
 if(id==='direct-opportunity'&&(!data.turn?.demoReportSources?.length||!data.turn.answer.includes('2,000')))errors.push('missing verified price');
 results.push({id,message,status:response.status,errors,...data});console.log(id,response.status,JSON.stringify(errors),'\n'+data.turn?.answer);
}
await mkdir('docs/evaluations',{recursive:true});await writeFile('docs/evaluations/studio-tone-20261015-v35.json',JSON.stringify({edgeVersion:35,fictionalOnly:true,inlineSyntheticRows:32,results},null,2));
if(results.some(x=>x.errors.length))process.exitCode=1;
