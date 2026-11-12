// Bounded acceptance checks. These are transparent heuristics + exact data checks,
// not an independent model judge or a claim of conversational quality equivalence.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../docs/evaluations/',import.meta.url);
const baseline=JSON.parse(await readFile(new URL('v22-baseline.json',base),'utf8'));
const candidate=JSON.parse(await readFile(new URL('v22-candidate.json',base),'utf8'));
assert.equal(baseline.scenarios.length,30);assert.equal(candidate.scenarios.length,30);
const mustDecline=[2,7,8,9,10,11,13,14,15,16,20,21,22,23,24,26,27,28,29];
const money={7:[26025,21235,19685,13725],8:[17870,23100,21330],9:[4730,2115],10:[5880],12:[27910,26025,19685],13:[19685,13725],14:[26025],15:[13725],16:[19685],17:[5070,4425],19:[3745]};
const results=[];
function stats(data){const turns=data.scenarios.flatMap(s=>s.turns),times=turns.map(t=>t.ms).sort((a,b)=>a-b);return {groups:data.scenarios.length,turns:turns.length,httpSuccess:turns.filter(t=>t.status===200).length,sdk:turns.filter(t=>t.turn?.engine==='sdk').length,fallbacks:turns.filter(t=>t.turn?.agentFallback).length,reportSources:turns.reduce((n,t)=>n+(t.turn?.demoReportSources?.length||0),0),medianMs:times[Math.floor(times.length/2)],p95Ms:times[Math.ceil(times.length*.95)-1],meanAnswerCharacters:Math.round(turns.reduce((n,t)=>n+(t.turn?.answer?.length||0),0)/turns.length)};}
for(const s of candidate.scenarios){
 const checks={twoTurns:s.turns.length===2,http:s.turns.every(t=>t.status===200),noFallback:s.turns.every(t=>!t.turn?.agentFallback),exactReportMetrics:s.turns.every(t=>!t.reportValidationErrors?.length)};
 if(mustDecline.includes(s.id))checks.knownBoundaryExplained=/(不能|无法|不够|不足|不建议|先别|没有|不知道|不可以|不会|缺少|不等于|不代表|未|不应)/.test(s.turns[1].turn?.answer||'');
 if(money[s.id]){const text=(s.turns[0].turn?.answer||'').replace(/[,，\s]/g,'');checks.requestedAmountsPresent=money[s.id].every(n=>text.includes(String(n)));}
 if(s.id===5)checks.englishOnly=s.turns.every(t=>!/[\p{Script=Han}]/u.test(t.turn?.answer||''));
 if(s.id===17)checks.cutoffRetained=s.turns.every(t=>t.turn?.demoReportSources?.some(r=>r.filters.from==='2026-10-01'&&r.filters.to==='2026-10-10'));
 if(s.id===18)checks.intersectionFilters=s.turns[0].turn?.demoReportSources?.some(r=>r.filters.channelId==='google'&&r.filters.service==='Wedding'&&r.filters.from==='2026-08-01');
 results.push({id:s.id,name:s.name,checks,technicalPass:Object.values(checks).every(Boolean),memoryScope:s.id>=22&&s.id<=24?'Conversation boundary test; durable DB lifecycle is tested separately, including a simulated prior-day approved timestamp.':undefined});
}
const output={at:new Date().toISOString(),baseline:stats(baseline),candidate:stats(candidate),scenarios:results,limitations:['Before/after changes model, reasoning, prompt and session handling together; not a single-variable model benchmark.','Boundary-language heuristics require human reading; they do not prove database permission enforcement.','Cross-day elapsed time and real two-device login remain untested; SQL lifecycle checks use simulated time and rollback.']};
await writeFile(new URL('v22-acceptance.json',base),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
if(results.some(r=>!r.technicalPass))process.exitCode=1;
