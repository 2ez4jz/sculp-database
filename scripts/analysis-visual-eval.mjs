// Actual deployed AI plus the same browser adapter, using only the 300 fictional orders.
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {bookings,clients,artists,partners} from '../src/data/demo.js';
import {searchCatalog} from '../src/domain/sculpy.js';
import {advisorRowsFromBookings} from '../src/domain/demo-workspace.js';
import {demoChatAdapter} from '../src/services/chat.js';
const output=process.argv[2]||'/tmp/sculp-visual-eval.json',results=[];
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};globalThis.window={DemoI18n:{language:'zh'}};
globalThis.fetch=async (url,opts)=>new Promise((resolve,reject)=>{
 const child=spawn('curl',['-sS','--max-time','180',String(url),'-H','Origin: http://localhost:4173','-H','Content-Type: application/json','--data-binary','@-']);
 let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('close',code=>{try{const data=JSON.parse(out);resolve({ok:!data.error,json:async()=>data});}catch{reject(Error(err||out||String(code)));}});child.stdin.end(opts.body);
});
const context={role:'admin'},catalog=searchCatalog({bookings,artists,partners,notes:[],client:id=>clients.find(c=>c.id===id),serviceName:{Wedding:'婚礼',Event:'活动',Education:'课程',Commercial:'商业'},context});
const groups=[[
 {id:'auto-daily',message:'出2026年9月的简短日报汇总，解释订单状态、服务构成、完成金额与实际收款。用普通人能听懂的语言。',check:t=>t.analysisCharts.some(c=>c.title==='status')&&t.analysisCharts.find(c=>c.title==='finance')?.rows[0].value===1968500},
 {id:'auto-trend',message:'分别对比2026年8月与9月的完成金额和到账原额，日期范围分开，简单说明哪里变了。',check:t=>t.analysisCharts.some(c=>c.kind==='trend'&&c.rows.length===2)}
],[
 {id:'auto-cross',message:'分析2026年9月Instagram渠道的婚礼订单数量和状态。',check:t=>t.demoReportSources?.some(s=>s.filters.service==='Wedding'&&s.filters.channelId==='instagram'&&s.records===3)},
 {id:'auto-followup',message:'沿用刚才的日期与条件，用图看看。',check:t=>t.analysisCharts.some(c=>c.filters?.service==='Wedding'&&c.filters?.channelId==='instagram'&&c.rows.reduce((n,r)=>n+r.value,0)===3)}
],[
 {id:'auto-receipts',message:'给2026年9月各渠道的到账原额占比饼图，收款按实际收款日。',check:t=>t.analysisCharts.some(c=>c.kind==='donut'&&c.metric==='grossReceivedCents')},
 {id:'auto-schedule',message:'看看2026-09-05的排期，按已有日期、化妆师与时间说明安排，咨询中的订单不要当已确认。',check:t=>t.analysisCharts.some(c=>c.kind==='schedule'&&c.from==='2026-09-05'&&c.to==='2026-09-05'&&c.rows.length>0)}
]];
await Promise.all(groups.map(async (cases,index)=>{const adapter=demoChatAdapter({getIdentity:()=>`visual-eval-${index}`,getCatalog:()=>catalog,getContext:()=>context,getAdvisorRows:()=>advisorRowsFromBookings(bookings),saveBatch:async()=>{throw Error('Read-only evaluation')}});for(const c of cases){const started=Date.now();try{const turn=await adapter.send('global',{message:c.message,requestId:crypto.randomUUID()});results.push({id:c.id,ms:Date.now()-started,passed:c.check(turn),turn});}catch(error){results.push({id:c.id,passed:false,error:error.message});}writeFileSync(output,JSON.stringify({date:'2026-10-11',mode:'fictional_300_live_visuals',results},null,2));console.log(JSON.stringify(results.at(-1)));}}));
console.log(`Passed ${results.filter(r=>r.passed).length}/${results.length}; manually review answers and date/filter choices.`);
