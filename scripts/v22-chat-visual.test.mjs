import test from 'node:test';import assert from 'node:assert/strict';
import {demoChatAdapter,wantsChatVisual} from '../src/services/chat.js';import {bookings} from '../src/data/demo.js';import {demoReport} from '../supabase/functions/sculpy-chat/demo-report.js';
test('V2.2 simple answers avoid automatic charts; explicit chart follow-ups retain reports',async()=>{
 for(const q of ['8月完成金额是多少？一句话','解释收入和到账的区别','排期怎么样','各渠道占比多少','不要图表，只告诉我金额'])assert.equal(wantsChatVisual(q),false,q);
 for(const q of ['用图看看','再画渠道分布图，保持日期','9月收入饼图','Show a channel chart'])assert.equal(wantsChatVisual(q),true,q);
 const old={fetch:globalThis.fetch,localStorage:globalThis.localStorage,location:globalThis.location,window:globalThis.window};const saved=new Map();
 globalThis.localStorage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};globalThis.location={search:'?demo=1'};globalThis.window={DemoI18n:{language:'zh'}};
 const filters={from:'2026-08-01',to:'2026-08-31',service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:'service'};
 const report=demoReport(bookings,filters,'2026-10-14');
 globalThis.fetch=async()=>Response.json({turn:{id:crypto.randomUUID(),answer:'CAD 26,025.00',references:[],proposals:[],sourceIds:[],demoReportSources:[report]}});
 try{const adapter=demoChatAdapter({getIdentity:()=> 'qa',getCatalog:()=>({bookings,notes:[]}),getContext:()=>({role:'admin'}),saveBatch:()=>{}});
 const simple=await adapter.send('global',{requestId:crypto.randomUUID(),message:'2026年8月完成金额是多少？一句话'});assert.equal(simple.analysisCharts,undefined);assert.equal(simple.chartKey,undefined);assert.equal(simple.demoReportSources.length,1);
 const visual=await adapter.send('global',{requestId:crypto.randomUUID(),message:'用图看看8月各服务收入占比'});assert(visual.analysisCharts.length>0);assert.equal(visual.demoReportSources.length,1);
 }finally{Object.assign(globalThis,old);}
});
