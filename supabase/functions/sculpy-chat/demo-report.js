// Read-only, full-catalog fictional analytics. Never queries or writes production data.
const fields=['from','to','service','channelId','artistId','bookingId','status','groupBy'];
const services=['Wedding','Event','Education','Commercial','Trial','Photoshoot'];
const statuses=['Completed','Confirmed','Inquiry','Cancelled'];
const validDate=(v)=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(+new Date(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const cents=(b)=>typeof b.price==='number'&&Number.isFinite(b.price)&&b.price>=0&&Number.isSafeInteger(Math.round(b.price*100))&&Math.abs(b.price*100-Math.round(b.price*100))<1e-6?Math.round(b.price*100):null;
export function demoReport(catalog,args,asOfDate){
 if(!validDate(asOfDate)||!args||fields.some(k=>!(k in args))||Object.keys(args).some(k=>!fields.includes(k))||!validDate(args.from)||!validDate(args.to)||args.from>args.to)throw Error('Invalid report date or fields');
 if(args.service!==null&&!services.includes(args.service)||args.status!==null&&!statuses.includes(args.status)||![null,'service','channel','artist'].includes(args.groupBy))throw Error('Invalid report filters');
 for(const key of ['channelId','artistId','bookingId'])if(args[key]!==null&&(typeof args[key]!=='string'||!args[key]||args[key].length>100))throw Error('Invalid filter ID');
 const matches=(b,channelId=args.channelId)=>(args.service===null||b.service===args.service)&&(channelId===null||(b.channelId||'unattributed')===channelId)&&(args.artistId===null||b.artistIds?.includes(args.artistId))&&(args.bookingId===null||b.id===args.bookingId)&&(args.status===null||b.status===args.status);
 const scoped=catalog.filter(b=>matches(b));
 const aggregate=(rows)=>{
  const selected=rows.filter(b=>validDate(b.date)&&b.date>=args.from&&b.date<=args.to),completed=selected.filter(b=>b.status==='Completed');
  const receipts=rows.filter(b=>validDate(b.paidDate)&&b.paidDate>=args.from&&b.paidDate<=args.to);
  const displayAmount=n=>'CAD '+(n/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
  const stateCounts=Object.fromEntries(statuses.map(s=>[s,selected.filter(b=>b.status===s).length]));
  const priced=completed.filter(b=>(!b.currency||b.currency==='CAD')&&cents(b)!==null);
  const validReceipts=receipts.filter(b=>(!b.currency||b.currency==='CAD')&&Number.isSafeInteger(b.paidCents)&&b.paidCents>=0);
  return {warning:selected.length<10?'LOW_SAMPLE':null,records:selected.length,statusCounts:stateCounts,completed:completed.length,completedAmountCents:priced.reduce((n,b)=>n+cents(b),0),grossReceivedCents:validReceipts.reduce((n,b)=>n+b.paidCents,0),
   displayAmounts:{completed:displayAmount(priced.reduce((n,b)=>n+cents(b),0)),grossReceived:displayAmount(validReceipts.reduce((n,b)=>n+b.paidCents,0))},
   unpricedCompleted:completed.filter(b=>cents(b)===null).length,nonCadCompleted:completed.filter(b=>b.currency&&b.currency!=='CAD').length,
   futureCompleted:completed.filter(b=>b.date>asOfDate).length,completedOnOrBeforeAsOf:completed.filter(b=>b.date<=asOfDate).length,
   unknownChannel:selected.filter(b=>!b.channelId).length,unknownTime:selected.filter(b=>!b.startTime||!b.endTime).length,
   undatedReceipts:rows.filter(b=>b.paidCents>0&&!validDate(b.paidDate)).length,invalidReceiptAmounts:receipts.length-validReceipts.length,
   recordsSample:selected.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).slice(0,30),sampleTruncated:selected.length>30};
 };
 const key=(b)=>args.groupBy==='service'?b.service:args.groupBy==='channel'?(b.channelId||'unattributed'):(b.artistIds?.[0]||'unassigned');
 const groups=args.groupBy?[...new Set(scoped.map(key))].sort().map(value=>({value,...aggregate(scoped.filter(b=>key(b)===value))})):[];
 const rankings=Object.fromEntries(['records','completed','completedAmountCents','grossReceivedCents'].map(field=>{
  const maximum=groups.length?Math.max(...groups.map(g=>g[field])):null;
  return [field,{maximum,leaders:groups.filter(g=>g[field]===maximum).map(g=>({value:g.value,records:g.records,completed:g.completed,completedAmountCents:g.completedAmountCents,grossReceivedCents:g.grossReceivedCents}))}];
 }));
 const current=aggregate(scoped);
 const relation=(n)=>n===0?'equal':n>0?'more':'fewer';
 const channelComparisons=args.channelId===null?[]:[...new Set(catalog.map(b=>b.channelId||'unattributed'))].filter(id=>id!==args.channelId).sort().map(peerChannelId=>{
  const peer=aggregate(catalog.filter(b=>matches(b,peerChannelId)));
  const delta={records:current.records-peer.records,completed:current.completed-peer.completed,completedAmountCents:current.completedAmountCents-peer.completedAmountCents,grossReceivedCents:current.grossReceivedCents-peer.grossReceivedCents};
  return {currentChannelId:args.channelId,peerChannelId,peer:{records:peer.records,completed:peer.completed,completedAmountCents:peer.completedAmountCents,grossReceivedCents:peer.grossReceivedCents},currentMinusPeer:delta,recordCountRelation:relation(delta.records),completedCountRelation:relation(delta.completed)};
 });
 return {rankings,channelComparisons,source:'current_fictional_demo_full_catalog',fictional:true,currency:'CAD',asOfDate,filters:args,coverage:{catalogRecords:catalog.length,scopedRecords:scoped.length,allMatchingRowsAggregated:true},
  ...aggregate(scoped),groups,artistGrouping:'primary_artist_only; artistId filter includes collaborators',
  limitations:{newOrderCountUnavailable:true,conversionRateUnavailable:true,profitUnavailable:true,netReceiptsUnavailable:true,overdueReceivablesUnavailable:true},
  catalogQuality:{futureDatedReceipts:catalog.filter(b=>b.paidCents>0&&validDate(b.paidDate)&&b.paidDate>asOfDate).length,futureCompleted:catalog.filter(b=>b.status==='Completed'&&validDate(b.date)&&b.date>asOfDate).length,completedOnOrBeforeAsOf:catalog.filter(b=>b.status==='Completed'&&validDate(b.date)&&b.date<=asOfDate).length,invalidServiceDates:catalog.filter(b=>!validDate(b.date)).length}};
}

// Persist only the report scope and verified summary. Full samples/groups are
// tool inputs, not conversation history; retaining them inflates every follow-up.
export const compactDemoReport=r=>({source:r.source,fictional:r.fictional,asOfDate:r.asOfDate,filters:r.filters,coverage:r.coverage,records:r.records,completed:r.completed,completedAmountCents:r.completedAmountCents,grossReceivedCents:r.grossReceivedCents,unpricedCompleted:r.unpricedCompleted,nonCadCompleted:r.nonCadCompleted,catalogQuality:r.catalogQuality});

// Basic chart figures are rendered from verified tool results, never model arithmetic.
export function demoVisualSummary(report,question,en=false){
 const names={Wedding:['婚礼','Wedding'],Event:['活动','Event'],Education:['课程','Education'],Commercial:['商业','Commercial'],Completed:['已完成','Completed'],Confirmed:['已确认','Confirmed'],Inquiry:['咨询中','Inquiry'],Cancelled:['已取消','Cancelled'],website:['官网','Website'],referral:['转介绍','Referral'],instagram:['Instagram','Instagram'],google:['Google','Google'],planner:['Planner','Planner'],unattributed:['未归因','Unattributed']};
 const name=v=>names[v]?.[en?1:0]||v;
 const money=n=>'CAD '+(n/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
 const monetary=/(收入|金额|营收|到账|收款|revenue|value|receipt|received)/i.test(question);
 const metric=monetary?/(到账|收款|receipt|received)/i.test(question)&&!/(完成|completed)/i.test(question)?'grossReceivedCents':'completedAmountCents':'records';
 const scope=Object.entries(report.filters).filter(([k,v])=>!['from','to','groupBy'].includes(k)&&v!==null).map(([,v])=>name(v)).join(' · ');
 const groups=report.groups.length?report.groups.map(g=>({label:name(g.value),value:g[metric]})):!monetary?Object.entries(report.statusCounts).map(([k,value])=>({label:name(k),value})):[];
 const total=report[metric],fmt=v=>monetary?money(v):v+(en?' records':' 条');
 const heading=(en?'Fictional test data: ':'虚构测试数据：')+report.filters.from+' → '+report.filters.to+(scope?' · '+scope:'');
 let text=heading+'\n'+(en?'Total: ':'合计：')+fmt(total)+(en?'.':'。');
 if(groups.length&&total>0)text+='\n'+groups.map(g=>g.label+' '+fmt(g.value)+'（'+(g.value/total*100).toFixed(1)+'%）').join('；')+(en?'.':'。');
 if(report.warning)text+='\n'+(en?'Small sample: these records do not establish long-term performance.':'样本少，只说明这部分记录的情况。');
 if(monetary)text+='\n'+(metric==='grossReceivedCents'?(en?'Receipts follow actual receipt dates, before refunds.':'收款按实际收款日期统计，为未扣退款的到账原额。'):(en?'Completed value follows service dates; it is not profit.':'完成金额按服务日期统计，不是利润。'));
 if(metric==='completedAmountCents'&&(report.unpricedCompleted||report.nonCadCompleted))text+='\n'+(en?'Missing prices or non-CAD amounts make this total incomplete.':'有未知价格或非 CAD 金额，合计不完整。');
 if(report.futureCompleted)text+='\n'+(en?'Future-dated completed statuses require review.':'含未来日期的完成状态，需核对。');
 return text;
}

// Current minus peer; zero denominators never produce a growth percentage.
export function compareDemoReports(current,peer){
 const format=n=>'CAD '+(n/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
 return {direction:'current_minus_peer',currentFilters:current.filters,peerFilters:peer.filters,metrics:Object.fromEntries(['records','completed','completedAmountCents','grossReceivedCents'].map(key=>{const delta=current[key]-peer[key];return [key,{current:current[key],peer:peer[key],delta,percent:peer[key]===0?null:Math.round(delta/peer[key]*1000)/10,...(key.endsWith('Cents')?{displayDelta:format(delta)}:{})}];}))};
}
