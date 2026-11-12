import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {answerBlocks,renderChatAnswer,renderAnswerBlocks} from '../src/components/chat/answer-view.js';
const r={source:'current_fictional_demo_full_catalog',fictional:true,filters:{from:'2026-09-01',to:'2026-09-30'},completedAmountCents:1968500,grossReceivedCents:1372500,completed:21,asOfDate:'2026-10-14'};
test('simple replies stay simple; prose cannot become an invented financial card',()=>{
 const output=renderChatAnswer({answer:'9月完成金额 CAD 19,685.00。',demoReportSources:[r]});assert(!output.includes('response-metrics'));assert(!output.includes('<details'));assert(output.includes('19,685.00'));
 const long=renderChatAnswer({answer:'这是长篇解释。'.repeat(70)+'\n\n没有成本，不能计算利润。'});assert(!long.includes('response-metrics'));assert(long.includes('response-details'));assert(long.includes('response-warning'));
});
test('verified figures and exact filter labels survive comparison; missing prices remain visible',()=>{
 const turn=Object.freeze({id:'qa',answer:'先看实际变化。\n\n'+('这些数字不能证明原因。'.repeat(50))+'\n\n建议先核对状态。',demoReportSources:[r,{...r,filters:{...r.filters,channelId:'google'},unpricedCompleted:1}]});
 const html=renderChatAnswer(turn,'<div class="trusted-chart"></div>',{expanded:true});assert(html.includes('19,685.00'));assert(html.includes('13,725.00'));assert(html.includes('google'));assert(html.includes('金额合计不完整'));assert(html.includes('response-table'));assert(html.includes('response-next'));assert(html.includes(' open'));assert(html.includes('trusted-chart'));assert(html.includes('查看完整回答'));
 assert(!renderChatAnswer({...turn,demoReportSources:[{...r,source:'invented'}]}).includes('response-facts'));
});
test('safe Markdown renders real tables and lists, never executable HTML or links',()=>{
 const markdown='比较如下。\n\n| 渠道 | 金额 |\n|---|---:|\n| <img src=x onerror=alert(1)> | **CAD 3.00** |\n\n1. 核对\n2. 再查\n\n<script>alert(1)</script>';
 const html=renderChatAnswer({answer:markdown});assert(html.includes('<table'));assert(html.includes('<ol>'));assert(html.includes('<strong>CAD 3.00</strong>'));assert(!html.includes('<img'));assert(!html.includes('<script'));assert(html.includes('&lt;script&gt;'));assert(html.includes('&lt;img'));
 const plain=renderAnswerBlocks(answerBlocks('2026.09 是月份。\n\n1.23 是数值。'));assert(plain.includes('2026.09'));assert(plain.includes('1.23'));
});
test('all saved 30-group model replies render without requests or mutation, retaining original answer',async()=>{
 const files=['v22-baseline.json','v22-candidate-before-concise.json','v22-candidate.json'];let count=0;const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('Presentation must not call an API');};
 try{for(const file of files){const data=JSON.parse(await readFile(new URL('../docs/evaluations/'+file,import.meta.url),'utf8'));for(const s of data.scenarios)for(const entry of s.turns){const turn=entry.turn,before=JSON.stringify(turn),html=renderChatAnswer(turn);assert(html.length>0);assert.equal(JSON.stringify(turn),before);if(html.includes('response-details'))assert(html.includes('response-full'));count++;}}}finally{globalThis.fetch=old;}assert.equal(count,180);
});
