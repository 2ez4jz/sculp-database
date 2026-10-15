import {allowsIllustrativeNumbers} from "../supabase/functions/sculpy-chat/agent-routing.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedFollowups,renderFollowups} from '../src/components/chat/followups.js';
import {renderChatAnswer} from '../src/components/chat/answer-view.js';
const source={source:'current_fictional_demo_full_catalog',fictional:true,filters:{from:'2026-01-01',to:'2026-10-15',groupBy:'venue'},completed:3,completedAmountCents:300000,grossReceivedCents:300000};
const turn={id:'sample',user:'哪个场地客单价最高',answer:'A场地今年平均每单更高。',demoReportSources:[source]};
test('guided questions are bounded, read-only and not repeated during follow-ups',()=>{
 assert.equal(suggestedFollowups(turn).length,2);
 assert.equal(suggestedFollowups(turn,{previousTurns:[turn]}).length,0);
 assert.equal(suggestedFollowups({...turn,user:'我不知道接着问什么'},{previousTurns:[turn]}).length,2);
 assert.equal(suggestedFollowups({...turn,user:'只要数字'}).length,0);
 assert.equal(suggestedFollowups({...turn,demoReportSources:[]}).length,0);
 assert.equal(suggestedFollowups({...turn,proposals:[{saved:false}]}).length,0);
 assert.match(suggestedFollowups(turn,{en:true})[0].label,/Why/);
 assert.doesNotMatch(renderFollowups(turn),/<script|onclick=/);
 assert.match(renderFollowups(turn),/data-followup/);
});
test('key reasoning, original ranking table and next step remain visible without opening details',()=>{
 const answer='先看这两个时间范围。\n\n| 范围 | 最高场地 | 每单平均 |\n|---|---|---|\n| 今年 | A | CAD 1,000.00 |\n| 全部历史 | B | CAD 5,250.00 |\n\n### 怎么看\n历史的B场地主要被一笔旧大单拉高，今年不能照搬这个排名。\n\n- A今年的价格更高，可以先核对同类套餐。\n- B过去的一单很特别，不代表每个客人都愿意多花钱。\n\n建议先打开B那笔旧订单，看看是不是服务了更多人。';
 const html=renderChatAnswer({...turn,answer,demoReportSources:[source,{...source,filters:{...source.filters,from:'2025-01-01'}}]});
 const visible=html.split('<details')[0];
 assert.match(visible,/历史的B场地/);assert.match(visible,/<ul>/);assert.match(visible,/5,250.00/);assert.match(visible,/打开B那笔旧订单/);
 assert.doesNotMatch(visible,/response-facts/);assert.match(html,/response-full/);
});

test('plain-language definitions can use marked examples without authorizing invented studio figures',()=>{
 assert(allowsIllustrativeNumbers('客单价是啥？','比如两笔订单分别500加元和1000加元，平均750加元。'));
 assert(!allowsIllustrativeNumbers('我们今年的收入是多少？','比如今年收入1000加元。'));
 assert(!allowsIllustrativeNumbers('哪个场地客单价最高','例如A场地CAD1000。'));
 assert(!allowsIllustrativeNumbers('客单价是啥','你的客户每单500加元。'));
});
