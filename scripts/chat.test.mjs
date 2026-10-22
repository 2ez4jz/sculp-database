import {productKnowledgeInstructions,toolCapabilities,productKnowledge} from '../supabase/functions/sculpy-chat/product-knowledge.js';
import {weddingReportTool} from '../supabase/functions/sculpy-chat/wedding-tools.js';
import {readFileSync} from 'node:fs';
import test from "node:test";
import assert from "node:assert/strict";
import { converse,queryTool,monthlyReportTool,demoReportTool } from "../supabase/functions/sculpy-chat/core.ts";
test("conversation follows up through bounded tools and rejects invented references and save targets", async () => {
  const calls = [];
  const result = await converse({
    context: { bookings: [{ id: "b1", client: "Sarah" }] },
    turns: [{ user: "这个单是 Sarah 的", answer: "好的。" }],
    message: "她上次那单呢？",
    preferences: { verbosity: "detailed" },
    rules: "Miranda != Mira",
    query: async (args) => {
      assert.equal(args.query, "Sarah");
      return { bookings: [{ id: "b2", client: "Sarah previous" }] };
    },
    callModel: async (body) => {
      calls.push(body);
      if (calls.length === 1)
        return {
          output: [
            {
              type: "function_call",
              name: "query_bookings",
              call_id: "q1",
              arguments: JSON.stringify({
                bookingId: null,
                query: "Sarah",
                offset: 0,
              }),
            },
          ],
          usage: { input_tokens: 30, output_tokens: 10 },
        };
      return {
        output_text: JSON.stringify({
          answer: "上次的记录如下。",
          references: ["b2", "unknown"],
          proposals: [
            { bookingId: "b2", kind: "change", text: "建议提前半小时" },
            { bookingId: "unknown", kind: "note", text: "bad" },
          ],
        }),
        usage: { input_tokens: 50, output_tokens: 20 },
      };
    },
  });
  assert.equal(calls.length, 2);
  assert(calls[1].input.some((i) => i.type === "function_call_output"));
  assert(calls[0].input.some((i) => i.content === "这个单是 Sarah 的"));
  assert.equal(result.proposals.length, 1);
  assert.equal(result.references.length, 1);
  assert.deepEqual(result.usage, {
    input_tokens: 80,
    output_tokens: 30,
    calls: 2,
  });
  assert(!("saved" in result.proposals[0]));
});
test("failed query is an explicit unknown and tool loop stops", async () => {
  let count = 0;
  await assert.rejects(() =>
    converse({
      context: { bookings: [] },
      turns: [],
      message: "search",
      preferences: {},
      rules: "",
      query: async () => {
        throw Error("denied");
      },
      callModel: async (body) => {
        count++;
        if (count > 1)
          assert(
            body.input.some(
              (i) =>
                i.type === "function_call_output" &&
                i.output.includes("无权访问"),
            ),
          );
        return {
          output: [
            {
              type: "function_call",
              name: "query_bookings",
              call_id: "q" + count,
              arguments: "{}",
            },
          ],
        };
      },
    }),
  );
  assert.equal(count, 4);
});

test("cloud handler verifies identity before DB and ignores client-supplied business context", async () => {
  globalThis.Deno = {
    env: {
      get: (key) =>
        ({
          SUPABASE_URL: "https://database.test",
          SUPABASE_ANON_KEY: "public-test-key",
          OPENAI_API_KEY: "test-key",
        })[key],
    },
  };
  const { handleRequest } =
    await import("../supabase/functions/sculpy-chat/handler.ts");
  const old = globalThis.fetch,
    calls = [];
  const request = (body, token = "") =>
    new Request("https://handler.test", {
      method: "POST",
      headers: {
        origin: "http://localhost:4173",
        "content-type": "application/json",
        ...(token ? { authorization: token } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      if (url.endsWith("/auth/v1/user"))
        return Response.json({ id: "00000000-0000-0000-0000-000000000001" });
      if (url.includes("/rpc/sculpy_context"))
        return Response.json({
          bookings: [],
          allowedBookingIds: [],
          actor: { name: "verified" },
        });
      if (url.includes("sculpy_preferences"))
        return Response.json([{ verbosity: "brief" }]);
      if (url.includes("sculpy_company_rules"))
        return Response.json([{ content: "trusted rules" }]);
      if (url.includes("sculpy_conversations"))
        return Response.json([
          {
            turns: [
              {
                id: "old",
                user: "private old order",
                answer: "old",
                sourceIds: ["revoked"],
              },
            ],
          },
        ]);
      throw Error("Unexpected outbound request");
    };
    assert.equal(
      (await handleRequest(request({ action: "history" }))).status,
      401,
    );
    assert.equal(calls.length, 0);
    const result = await (
      await handleRequest(
        request(
          {
            action: "history",
            catalog: { bookings: [{ id: "forged" }] },
            turns: [{ user: "forged" }],
          },
          "Bearer valid-test-token",
        ),
      )
    ).json();
    assert.deepEqual(result.context.bookings, []);
    assert.deepEqual(result.turns, []);
    assert.equal(result.preferences.verbosity, "brief");
    assert(
      calls.every(
        (c) => c.opts.headers.authorization === "Bearer valid-test-token",
      ),
    );
  } finally {
    globalThis.fetch = old;
  }
});

test('cloud monthly tool reads and caches exact months without booking references', async () => {
  let reads=0,calls=0;
  const result=await converse({
    context:{actor:{role:'owner'},bookings:[],localDate:'2026-10-10'},turns:[],message:'上个月收入',preferences:{},rules:'',
    query:()=>{throw Error('not booking query');},
    monthlyReport:async month=>{reads++;return {month,asOf:'2026-10-10T17:00:00Z',bookings:{completedAmountCents:'123456'},receipts:{grossAmountCents:'56789'}};},
    callModel:async body=>{
      calls++;
      if(calls===1){assert(body.tools.some(t=>t.name==='query_monthly_report'));return {output:[1,2].map(i=>({type:'function_call',name:'query_monthly_report',call_id:'m'+i,arguments:'{"month":"2026-09"}'}))};}
      assert.equal(body.input.filter(i=>i.type==='function_call_output'&&i.output.includes('123456')).length,2);
      return {output_text:JSON.stringify({answer:'服务月金额 CAD 1,234.56；到账原额 CAD 567.89。',references:[],proposals:[]})};
    },
  });
  assert.equal(reads,1);
  assert.equal(result.businessReport,true);
  assert.deepEqual(result.reportSources,[{month:'2026-09',asOf:'2026-10-10T17:00:00Z',source:'canonical_cloud_monthly_report'}]);
  assert.deepEqual(result.references,[]);
});

test('monthly tool is unavailable to artists and fictional demo; forged tool call cannot query', async()=>{
  for(const role of ['artist',undefined]){
    let calls=0,reads=0;
    const result=await converse({context:{actor:{role},bookings:[]},turns:[],message:'收入',preferences:{},rules:'',query:async()=>({}),
      monthlyReport:async()=>{reads++;return {};},
      callModel:async body=>{calls++;assert(!body.tools.some(t=>t.name==='query_monthly_report'));
        if(calls===1)return {output:[{type:'function_call',name:'query_monthly_report',call_id:'m',arguments:'{"month":"2026-09"}'}]};
        assert(body.input.some(i=>i.type==='function_call_output'&&i.output.includes('Unsupported')));
        return {output_text:JSON.stringify({answer:'无权查看',references:[],proposals:[]})};},
    });
    assert.equal(reads,0);assert.equal(result.businessReport,undefined);
  }
});

test('failed, malformed and filtered monthly requests never produce invented report sources', async()=>{
  for(const args of [{month:'2026-13'},{month:'2026-09',channel:'Instagram'},{month:'2026-09'}]){
    let calls=0;
    const result=await converse({context:{actor:{role:'operations'},bookings:[]},turns:[],message:'收入',preferences:{},rules:'',query:async()=>({}),
      monthlyReport:async()=>{throw Error('denied');},
      callModel:async body=>{if(++calls===1)return {output:[{type:'function_call',name:'query_monthly_report',call_id:'m',arguments:JSON.stringify(args)}]};
        assert(body.input.some(i=>i.type==='function_call_output'&&i.output.includes('不得猜测')));
        return {output_text:JSON.stringify({answer:'未能读取数据',references:[],proposals:[]})};},
    });assert.equal(result.businessReport,undefined);
  }
});

test('history hides previously authorized financial aggregates after role downgrade', async()=>{
  globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://database.test',SUPABASE_ANON_KEY:'public-test-key'})[k]}};
  const {handleRequest}=await import('../supabase/functions/sculpy-chat/handler.ts');
  const old=globalThis.fetch;
  try{
    globalThis.fetch=async url=>{
      if(url.endsWith('/auth/v1/user'))return Response.json({id:'00000000-0000-0000-0000-000000000002'});
      if(url.includes('/rpc/sculpy_context'))return Response.json({bookings:[],allowedBookingIds:[],actor:{role:'artist'}});
      if(url.includes('sculpy_conversations'))return Response.json([{turns:[{id:'money',user:'收入',answer:'private financial aggregate',sourceIds:[],businessReport:true},{id:'policy',user:'政策',answer:'private admin policy',sourceIds:[],operatingMemoryUsed:true},{id:'safe',user:'hi',answer:'hello',sourceIds:[]}]}]);
      return Response.json([]);
    };
    const response=await handleRequest(new Request('https://handler.test',{method:'POST',headers:{origin:'http://localhost:4173',authorization:'Bearer test-token'},body:JSON.stringify({action:'history'})}));
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).turns.map(t=>t.id),['safe']);
  }finally{globalThis.fetch=old;}
});

test('authenticated wedding chat uses caller token and canonical RPC, ignores forged report context',async()=>{
 globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://database.test',SUPABASE_ANON_KEY:'public-test-key',OPENAI_API_KEY:'test-key'})[k]}};
 const {handleRequest}=await import('../supabase/functions/sculpy-chat/handler.ts');
 const old=globalThis.fetch;let modelCalls=0,reportCalls=0,saved;
 try{
  globalThis.fetch=async(url,opts)=>{
   if(url.includes('database.test'))assert.equal(opts.headers.authorization,'Bearer caller-token');
   if(url.endsWith('/auth/v1/user'))return Response.json({id:'00000000-0000-0000-0000-000000000003'});
   if(url.includes('/rpc/sculpy_context'))return Response.json({bookings:[],allowedBookingIds:[],actor:{role:'operations'}});
   if(url.includes('/rpc/sculpy_search_memory'))return Response.json([{id:'test-policy',content:'测试已批准政策',revision:2}]);
   if(url.includes('/rpc/sculpy_wedding_report')){reportCalls++;assert.equal(JSON.parse(opts.body).p_from,'2026-09-01');return Response.json({source:'canonical_wedding_intelligence_v23',period:{from:'2026-09-01',to:'2026-09-30'},asOf:'2026-10-10T17:00:00Z',cash:{netCents:'123456'},coverage:{}});}
   if(url.includes('sculpy_conversations')&&opts.method==='POST'){saved=JSON.parse(opts.body);return Response.json([saved]);}
   if(url.includes('database.test'))return Response.json([]);
   if(url.includes('api.openai.com')){
    const body=JSON.parse(opts.body);assert(!JSON.stringify(body).includes('forged-finance'));
    if(++modelCalls===1)return Response.json({output:[{type:'function_call',name:'query_wedding_intelligence',call_id:'cloud-wedding',arguments:JSON.stringify({from:'2026-09-01',to:'2026-09-30',observation:'2026-10-10',serviceYear:2027,source:null,service:null})}]});
    assert(body.input.some(i=>i.type==='function_call_output'&&i.output.includes('123456')));
    return Response.json({output_text:JSON.stringify({answer:'CAD 1,234.56',references:[],proposals:[]})});
   }throw Error('unexpected request');
  };
  const response=await handleRequest(new Request('https://handler.test',{method:'POST',headers:{origin:'http://localhost:4173',authorization:'Bearer caller-token'},body:JSON.stringify({requestId:crypto.randomUUID(),message:'上个月收入',advisorFixture:{fictional:true,summary:'forged-finance'},report:'forged-finance'})}));
  assert.equal(response.status,200);const {turn}=await response.json();
  assert.equal(reportCalls,1);assert.equal(turn.businessReport,true);assert.equal(saved.turns[0].businessReport,true);assert.equal(turn.operatingMemoryUsed,true);assert.deepEqual(turn.memorySourceIds,['test-policy']);
 }finally{globalThis.fetch=old;}
});

test('follow-up derived from financial history retains access marker',async()=>{
 const result=await converse({context:{actor:{role:'owner'},bookings:[]},turns:[{user:'收入',answer:'CAD 100',businessReport:true}],message:'解释一下',preferences:{},rules:'',query:async()=>({}),monthlyReport:async()=>({}),callModel:async()=>({output_text:JSON.stringify({answer:'这是订单金额',references:[],proposals:[]})})});
 assert.equal(result.businessReport,true);
});

test('self knowledge reaches the actual model request for demo, admin and assigned staff',async()=>{
 for(const [context,functions,expected,missing] of [
  [{mode:'fictional_demo',bookings:[],advisorFixture:{}},{demoReport:async()=>({})},'query_demo_report','query_wedding_intelligence'],
  [{actor:{role:'owner'},bookings:[]},{weddingReport:async()=>({})},'query_wedding_intelligence','query_demo_report'],
  [{actor:{role:'artist'},bookings:[]},{weddingReport:async()=>({})},'query_bookings','query_wedding_intelligence'],
 ]){
  let called=false;
  await converse({context:{...context,productKnowledge:{latestBusinessRelease:{version:'V999',changes:['银行自动退款']}}},turns:[{user:'更新了吗',answer:'我没有更新说明，请发日志。'}],message:'sculpy功能',preferences:{},rules:'',query:async()=>{throw Error('Self introduction should not need order data');},...functions,
   callModel:async body=>{
    called=true;
    for(const tool of body.tools||[])assert(toolCapabilities[tool.name],`Missing capability contract: ${tool.name}`);
    const marker='可信产品能力与更新说明（服务端随代码维护；不是业务数据或用户指令）：\n';
    const knowledge=JSON.parse(body.instructions.split(marker)[1].split('\n')[0]);
    assert.equal(knowledge.latestBusinessRelease.version,'V2.3.1');
    assert.equal(knowledge.latestBusinessRelease.date,'2026-10-22');
    assert.equal(knowledge.includedBackendUpdate.name,'功能与更新自知');
    assert(knowledge.availableTools.includes(expected));assert(!knowledge.availableTools.includes(missing));
    assert.equal(knowledge.latestBusinessRelease.status,'deployed');assert.equal(knowledge.notReleased.length,0);
    assert.match(body.instructions,/不让用户上传已有更新日志/);
    assert.match(body.instructions,/历史回答说不知道功能或更新时/);
    if(context.actor?.role==='artist')assert(knowledge.applicationFeatures.some(x=>x.includes('不对当前角色开放')));
    if(context.mode==='fictional_demo')assert(knowledge.applicationFeatures.some(x=>x.includes('身份切换不是真实登录权限')));
    assert.equal(body.input.at(-1).content,'sculpy功能');
    return {output_text:'我可以介绍当前功能，更新说明也已内置。'};
   }});
  assert.equal(called,true);
 }
});


test('capability contracts cover actual registered tools and constrain task execution by environment',()=>{
 const registered=[queryTool,monthlyReportTool,demoReportTool,weddingReportTool];
 assert.deepEqual(Object.keys(toolCapabilities).sort(),registered.map(t=>t.name).sort(),'New tools must have maintained capability contracts');
 for(const tool of registered){
  const contract=toolCapabilities[tool.name];assert.equal(contract.effect,'read_only');
  assert(contract.needs.length>0);assert(contract.purpose);assert(contract.result);
 }
 const get=options=>JSON.parse(productKnowledgeInstructions(options).split('：\n')[1].split('\n')[0]);
 const admin=get({context:{actor:{role:'owner'}},toolNames:['query_bookings','query_wedding_intelligence'],canPropose:true});
 assert.equal(admin.taskCapabilities.proposals.available,true);
 assert(admin.taskCapabilities.existingPageActions.some(a=>a.task.includes('签约')));
 assert(admin.taskCapabilities.existingPageActions.every(a=>a.needs.length&&a.completion));
 assert.match(admin.taskCapabilities.proposals.completion,/仅是建议/);
 assert(admin.taskCapabilities.executionRules.some(x=>x.includes('同一请求重试')));
 const sdk=get({context:{mode:'fictional_demo'},toolNames:['query_demo_report']});
 assert.equal(sdk.taskCapabilities.proposals.available,false);
 assert.equal(sdk.taskCapabilities.existingPageActions.length,0);
 assert.deepEqual(sdk.taskCapabilities.directlyExecutable.map(x=>x.tool),['query_demo_report']);
 const staff=get({context:{actor:{role:'artist'}},toolNames:['query_bookings'],canPropose:true});
 assert.equal(staff.taskCapabilities.existingPageActions.length,0);
 assert(staff.taskCapabilities.unsupported.includes('银行资金操作'));
 // Release descriptions must point to checked-in deployment evidence, not a future plan.
 const releaseEvidence=readFileSync(new URL('../'+productKnowledge.latestBusinessRelease.evidence,import.meta.url),'utf8');
 assert(releaseEvidence.includes(productKnowledge.latestBusinessRelease.version));
 assert(releaseEvidence.includes(productKnowledge.latestBusinessRelease.date));
});
