// Uses only inline invented rows and newly written test prompts; reads no customer or conversation files.
import {mkdir,writeFile} from 'node:fs/promises';
const rows=[{id:'fake-a',date:'2026-08-01',service:'Wedding',status:'Completed',venueId:'fake-a',venueName:'测试场地A',price:1000,artistIds:['fake'],channelId:'fake'},{id:'fake-b',date:'2026-08-05',service:'Wedding',status:'Completed',venueId:'fake-b',venueName:'测试场地B',price:500,artistIds:['fake'],channelId:'fake'},{id:'fake-old',date:'2025-02-01',service:'Wedding',status:'Completed',venueId:'fake-b',venueName:'测试场地B',price:10000,artistIds:['fake'],channelId:'fake'}];
const cases=[
 ['casual','今天开发了一天，有点累，随便陪我聊两句。',false],
 ['concept','客单价是啥？说得像平时聊天，别讲术语。',false],
 ['creative','帮Sculpy想三句有趣的欢迎语，不要像客服。',false],
 ['plain-language','“对获客来说，核对订单来源与服务结构，再判断是否发展该场地的合作。”这句话帮我改成老板一眼能听懂的话，不用专业词。',false],
 ['business','哪个场地婚礼客单价最高',true],
 ['brief','哪个场地婚礼客单价最高？一句话。',true]
];
const results=[];
async function run([id,message,business]){
 const response=await fetch('https://lztzzdhqghwubygpzcbq.supabase.co/functions/v1/sculpy-chat',{method:'POST',headers:{origin:'https://2ez4jz.github.io','content-type':'application/json'},body:JSON.stringify({mode:'demo',agentMode:'sdk',requestId:crypto.randomUUID(),message,catalog:{bookings:rows,notes:[]},advisorFixture:{version:'sculp-unified-300-v2',fictional:true,summary:{}},turns:[],preferences:{verbosity:'balanced',instructions:'请用中文回复。'}}),signal:AbortSignal.timeout(180000)});
 const data=await response.json(),errors=[];
 if(response.status!==200)errors.push('HTTP '+response.status);
 if(data.turn?.agentFallback)errors.push('unexpected fallback');
 if(!business&&data.turn?.demoReportSources?.length)errors.push('unnecessary business report');
 if(business&&!data.turn?.demoReportSources?.length)errors.push('business figures not queried');
 if(id==='brief'&&/建议|核对|先看/.test(data.turn?.answer||''))errors.push('advice added to explicit short answer');
 if(id==='brief'&&data.turn?.answer?.split(/[。！？]/).filter(x=>x.trim()).length>2)errors.push('explicit brief ignored');
 results.push({id,message,status:response.status,errors,...data});
 await mkdir('docs/evaluations',{recursive:true});await writeFile('docs/evaluations/guided-chat-20261015-v34.json',JSON.stringify({edgeVersion:34,fictionalOnly:true,inlineSyntheticRows:3,results},null,2));
 console.log(id,response.status,JSON.stringify(errors),'\n'+data.turn?.answer);
}
for(let i=0;i<cases.length;i+=2)await Promise.all(cases.slice(i,i+2).map(run));
if(results.some(x=>x.errors.length))process.exitCode=1;
