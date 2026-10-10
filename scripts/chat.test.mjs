import test from "node:test";
import assert from "node:assert/strict";
import { converse } from "../supabase/functions/sculpy-chat/core.ts";
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
      if(url.includes('sculpy_conversations'))return Response.json([{turns:[{id:'money',user:'收入',answer:'private financial aggregate',sourceIds:[],businessReport:true},{id:'safe',user:'hi',answer:'hello',sourceIds:[]}]}]);
      return Response.json([]);
    };
    const response=await handleRequest(new Request('https://handler.test',{method:'POST',headers:{origin:'http://localhost:4173',authorization:'Bearer test-token'},body:JSON.stringify({action:'history'})}));
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).turns.map(t=>t.id),['safe']);
  }finally{globalThis.fetch=old;}
});

test('authenticated monthly chat uses caller token and canonical RPC, ignores forged report context',async()=>{
 globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://database.test',SUPABASE_ANON_KEY:'public-test-key',OPENAI_API_KEY:'test-key'})[k]}};
 const {handleRequest}=await import('../supabase/functions/sculpy-chat/handler.ts');
 const old=globalThis.fetch;let modelCalls=0,reportCalls=0,saved;
 try{
  globalThis.fetch=async(url,opts)=>{
   if(url.includes('database.test'))assert.equal(opts.headers.authorization,'Bearer caller-token');
   if(url.endsWith('/auth/v1/user'))return Response.json({id:'00000000-0000-0000-0000-000000000003'});
   if(url.includes('/rpc/sculpy_context'))return Response.json({bookings:[],allowedBookingIds:[],actor:{role:'operations'}});
   if(url.includes('/rpc/sculpy_monthly_report')){reportCalls++;assert.deepEqual(JSON.parse(opts.body),{p_month:'2026-09'});return Response.json({month:'2026-09',asOf:'2026-10-10T17:00:00Z',bookings:{completedAmountCents:'123456'},receipts:{grossAmountCents:'78900'}});}
   if(url.includes('sculpy_conversations')&&opts.method==='POST'){saved=JSON.parse(opts.body);return Response.json([saved]);}
   if(url.includes('database.test'))return Response.json([]);
   if(url.includes('api.openai.com')){
    const body=JSON.parse(opts.body);assert(!JSON.stringify(body).includes('forged-finance'));
    if(++modelCalls===1)return Response.json({output:[{type:'function_call',name:'query_monthly_report',call_id:'cloud-month',arguments:'{"month":"2026-09"}'}]});
    assert(body.input.some(i=>i.type==='function_call_output'&&i.output.includes('123456')));
    return Response.json({output_text:JSON.stringify({answer:'CAD 1,234.56',references:[],proposals:[]})});
   }throw Error('unexpected request');
  };
  const response=await handleRequest(new Request('https://handler.test',{method:'POST',headers:{origin:'http://localhost:4173',authorization:'Bearer caller-token'},body:JSON.stringify({requestId:crypto.randomUUID(),message:'上个月收入',advisorFixture:{fictional:true,summary:'forged-finance'},report:'forged-finance'})}));
  assert.equal(response.status,200);const {turn}=await response.json();
  assert.equal(reportCalls,1);assert.equal(turn.businessReport,true);assert.equal(saved.turns[0].businessReport,true);
 }finally{globalThis.fetch=old;}
});

test('follow-up derived from financial history retains access marker',async()=>{
 const result=await converse({context:{actor:{role:'owner'},bookings:[]},turns:[{user:'收入',answer:'CAD 100',businessReport:true}],message:'解释一下',preferences:{},rules:'',query:async()=>({}),monthlyReport:async()=>({}),callModel:async()=>({output_text:JSON.stringify({answer:'这是订单金额',references:[],proposals:[]})})});
 assert.equal(result.businessReport,true);
});
