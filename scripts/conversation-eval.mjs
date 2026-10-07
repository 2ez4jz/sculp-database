// Real model smoke evaluation. Fictional records only; never writes business data.
// node scripts/conversation-eval.mjs /tmp/sculpy-eval.json
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { config } from '../src/config.js';
const bookings = [
 {id:'qa-sarah',client:'Sarah Chen',starts_at:'2026-10-10T14:00:00-04:00',ends_at:'2026-10-10T17:00:00-04:00',venue:'测试 B 场地',address:'200 Test Avenue',artists:['Emily'],status:'confirmed'},
 {id:'qa-prior',client:'Lily Wang',starts_at:'2026-10-10T10:00:00-04:00',ends_at:'2026-10-10T13:10:00-04:00',venue:'测试 A 场地',address:'100 Fiction Road',artists:['Emily'],status:'confirmed'},
 {id:'qa-sarah2',client:'Sarah Lin',starts_at:'2026-10-11T11:00:00-04:00',venue:'测试 C 场地',artists:['Mira'],status:'confirmed'}
];
const cases = [
 {id:'simple',message:'这单几点，在哪里？一句话告诉我。',check:t=>/14:00|下午\s*[2两二]\s*点/.test(t.answer)&&t.answer.includes('测试 B')&&t.answer.length<220},
 {id:'tentative',message:'客户想提前半小时，但我前面还有一单，你看看行不行，先别改。',check:t=>t.proposals.length===0&&/20\s*分钟/.test(t.answer)&&!/时间上可行|可以赶上|肯定来得及/.test(t.answer)},
 {id:'followup',message:'那先记一下等客户确认，正式时间别动。',follow:true,check:t=>t.proposals.length>0&&t.proposals.every(p=>p.bookingId==='qa-sarah'&&/确认/.test(p.text))},
 {id:'correction',message:'不是她，是前面Lily那单，她说准备付定金，帮我记一下。',follow:true,check:t=>t.proposals.length>0&&t.proposals.every(p=>p.bookingId==='qa-prior')&&!/已到账|已付款/.test(t.proposals.map(p=>p.text).join(''))},
 {id:'stale',message:'现在到底是几点？',turns:[{user:'改到上午十点了吗？',answer:'已经改成上午10点。',sourceIds:['qa-sarah']}],check:t=>/14:00|下午\s*[2两二]\s*点/.test(t.answer)&&t.proposals.length===0},
 {id:'ambiguous',bookingId:null,message:'Sarah那单提前半小时。',check:t=>t.proposals.length===0&&/Chen/.test(t.answer)&&/Lin/.test(t.answer)},
 {id:'missing',message:'客户进场的密码是多少？',check:t=>t.proposals.length===0&&/没有|未|不清楚|查不到/.test(t.answer)},
 {id:'garbled',message:'该时间他说。',check:t=>t.proposals.length===0&&/[？?]/.test(t.answer)}
];
let history=[]; const results=[];
for(const c of cases){
 if(!c.follow) history=c.turns||[];
 const body={mode:'demo',requestId:crypto.randomUUID(),bookingId:c.bookingId===null?null:'qa-sarah',message:c.message,turns:history,preferences:{verbosity:'balanced'},catalog:{bookings,notes:[]}};
 const start=Date.now();
 const response=spawnSync('curl',['-sS','--max-time','110',process.env.SCULPY_EVAL_URL || config.supabaseUrl+'/functions/v1/sculpy-chat','-H','Origin: http://localhost:4173','-H','Content-Type: application/json','-H','apikey: '+config.supabasePublishableKey,'--data-binary','@-'],{input:JSON.stringify(body),encoding:'utf8'});
 let data; try{data=JSON.parse(response.stdout)}catch{data={error:response.stderr||response.stdout}};
 const row={id:c.id,message:c.message,ms:Date.now()-start,passed:!!data.turn&&c.check(data.turn),...data};
 results.push(row); if(data.turn)history.push(data.turn);
 console.log(JSON.stringify(row));
 writeFileSync(process.argv[2]||'/tmp/sculpy-eval.json',JSON.stringify({note:'Small live sample; checks are heuristics, naturalness requires human review. Not a production permission test.',results},null,2));
}
console.log(`${results.filter(r=>r.passed).length}/${results.length} heuristic checks passed`);
process.exitCode=results.every(r=>r.passed)?0:1;
