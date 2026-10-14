import { fixtureSummary } from '../data/advisor-fixtures.js';
import { advisorMetrics, advisorInsight } from './advisor-engine.js';
const services={bridal:'Wedding',occasion:'Event',lesson:'Education',commercial:'Commercial'};
const statuses={completed:'Completed',confirmed:'Confirmed',inquiry:'Inquiry',cancelled:'Cancelled'};
const channelIds={Instagram:'instagram',Google:'google',Planner:'planner',Referral:'referral',Website:'website'};
const validDate=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export const DEMO_DATA_VERSION='sculp-unified-300-v2';
export function workspaceBookings(rows, venues) {
 return rows.map(row=>{
  const i=Number(row.id.replace('fixture-',''))-1;
  const date=row.startLocal.slice(0,10), hour=Number(row.startLocal.slice(11,13));
  return {id:'b'+i,fixtureId:row.id,fictional:true,date,startTime:row.startLocal.slice(11,16),endTime:String(hour+(row.service==='bridal'?10:2)).padStart(2,'0')+':00',
   clientId:'c'+i,artistIds:[row.artist.toLowerCase(),...(i===0&&row.artist!=='Michelle'?['michelle']:[])],
   venueId:row.service==='lesson'?'studio':venues[i%venues.length].id,
   partnerIds:row.service==='lesson'?[]:i%2?['lumi','ever']:['mango','rebecca','bloom'],
   service:services[row.service],price:row.amountCents/100,currency:'CAD',status:statuses[row.status],
   channelId:channelIds[row.channel],paidCents:row.paidCents,paidDate:row.paidCents?date:null,classSchedule:row.classSchedule||null,
   createdAt:row.startLocal,version:0,details:'',needsReview:false};
 }).sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)));
}
// Project the currently visible, editable workspace; never regenerate a separate dataset for AI.
export function advisorRowsFromBookings(bookings,{channelForBooking=b=>b.channelId,channels=[]}={}) {
 const serviceCodes={Wedding:'bridal',Event:'occasion',Trial:'occasion',Photoshoot:'occasion',Education:'lesson',Commercial:'commercial'};
 const canonicalChannels={instagram:'Instagram',google:'Google',planner:'Planner',referral:'Referral',website:'Website',xiaohongshu:'小红书',other:'Other'};
 return bookings.map(b=>{
  const channelId=channelForBooking(b);
  const cad=!b.currency||b.currency==='CAD';
  const amount=typeof b.price==='number'?Math.round(b.price*100):null;
  const validAmount=cad&&Number.isSafeInteger(amount)&&amount>=0&&Math.abs(b.price*100-amount)<1e-6;
  const receipt=cad&&Number.isSafeInteger(b.paidCents)&&b.paidCents>=0;
  const dated=validDate(b.paidDate);
  return {id:b.id,clientId:b.clientId,service:serviceCodes[b.service],artist:b.artistIds[0],channel:canonicalChannels[channelId]||channels.find(c=>c.id===channelId)?.name||'Unattributed',
   status:b.status.toLowerCase(),startLocal:b.date+'T'+b.startTime,month:b.date.slice(0,7),
   amountCents:validAmount?amount:null,
   paidCents:receipt&&dated?b.paidCents:0,paidMonth:dated?b.paidDate.slice(0,7):null,
   undatedReceipt:b.paidCents>0&&!dated,invalidReceipt:b.paidCents>0&&!receipt,
   fictional:true,classSchedule:b.classSchedule||null};
 });
}
export function advisorSnapshot(rows) {
 const months=[...new Set(rows.flatMap(r=>[r.month,...(r.paidMonth?[r.paidMonth]:[])]))].sort();
 return {version:DEMO_DATA_VERSION,fictional:true,summary:{...fixtureSummary(rows),undatedReceipts:rows.filter(r=>r.undatedReceipt).length,invalidReceipts:rows.filter(r=>r.invalidReceipt).length},insights:advisorInsight(rows),
  byMonth:months.map(month=>({month,...advisorMetrics(rows,{month})})),
  byService:['bridal','occasion','lesson','commercial'].map(service=>({service,...advisorMetrics(rows,{service})})),
  byChannel:[...new Set(rows.map(r=>r.channel))].sort().map(channel=>({channel,...advisorMetrics(rows,{channel})}))};
}
