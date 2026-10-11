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
  const stateCounts=Object.fromEntries(statuses.map(s=>[s,selected.filter(b=>b.status===s).length]));
  const priced=completed.filter(b=>(!b.currency||b.currency==='CAD')&&cents(b)!==null);
  const validReceipts=receipts.filter(b=>(!b.currency||b.currency==='CAD')&&Number.isSafeInteger(b.paidCents)&&b.paidCents>=0);
  return {warning:selected.length<10?'LOW_SAMPLE':null,records:selected.length,statusCounts:stateCounts,completed:completed.length,completedAmountCents:priced.reduce((n,b)=>n+cents(b),0),grossReceivedCents:validReceipts.reduce((n,b)=>n+b.paidCents,0),
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
