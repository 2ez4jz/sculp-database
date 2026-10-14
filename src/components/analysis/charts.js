import {demoReport} from '../../../supabase/functions/sculpy-chat/demo-report.js';
import {reportMonths} from '../../domain/report-period.js';
const palette=['#40584c','#8caa83','#d2b575','#b97769','#718fa6','#a184a8','#999'];
const names={Wedding:['婚礼','Wedding'],Event:['活动','Event'],Education:['课程','Education'],Commercial:['商业','Commercial'],Trial:['试妆','Trial'],Photoshoot:['拍摄','Photoshoot'],instagram:['Instagram','Instagram'],google:['Google','Google'],planner:['Planner','Planner'],referral:['转介绍','Referral'],website:['官网','Website'],unattributed:['未归因','Unattributed'],Completed:['已完成','Completed'],Confirmed:['已确认','Confirmed'],Inquiry:['咨询中','Inquiry'],Cancelled:['已取消','Cancelled']};
const label=(v,en)=>names[v]?.[en?1:0]||({michelle:'Michelle',miranda:'Miranda',emily:'Emily',elaine:'Elaine',giselle:'Giselle',angelina:'Angelina',yuki:'Yuki',mira:'Mira',all:en?'All':'全部'})[v]||v;
export const wantsAnalysisVisual=q=>/(饼图|圆环|占比|图表|柱状|趋势图|画图|用图|排期|日程|schedule|timeline|pie|donut|chart|graph|visual)/i.test(q);
const dateToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const defaultArgs=day=>({from:day.slice(0,7)+'-01',to:day,service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:null});
function explicitArgs(q,day,previous){
 const period=/(20\d{2}|月|month|year|年|日|today|yesterday|天)/i.test(q);
 let args={...defaultArgs(day),...(!period&&previous?previous:{})};
 if(/300|全年|年度|annual|year/i.test(q)){const y=q.match(/20\d{2}/)?.[0]||day.slice(0,4);args={...defaultArgs(day),from:y+'-01-01',to:y+'-12-31'};}
 else if(/[今昨]天|今日|today|yesterday/i.test(q)){let d=day;if(/昨天|yesterday/i.test(q))d=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);args.from=args.to=d;}
 else if(period){const exact=[...q.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map(x=>x[0]);if(exact.length){args.from=exact[0];args.to=exact[1]||exact[0];}else{const m=reportMonths(q,day.slice(0,7));args.from=m[0]+'-01';const last=m.at(-1);args.to=new Date(Date.UTC(Number(last.slice(0,4)),Number(last.slice(5)),0)).toISOString().slice(0,10);if(/截至|本月|this month|as of/i.test(q)&&last===day.slice(0,7))args.to=day;}}
 for(const [name,regex] of Object.entries({Wedding:/婚礼|wedding|bridal/i,Event:/活动|occasion|event/i,Education:/课程|教学|education|lesson/i,Commercial:/商业|commercial/i}))if(regex.test(q))args.service=name;
 for(const id of ['instagram','google','planner','referral','website'])if(new RegExp(id,'i').test(q)&&!/(各|所有|all|by).{0,6}(渠道|channel)/i.test(q))args.channelId=id;
 args.groupBy=null;return args;
}
const cleanGroups=r=>r.groups.map(g=>({label:g.value,value:g.completedAmountCents,secondary:g.grossReceivedCents,count:g.records}));
export function buildAnalysisCharts({message,bookings,reports=[],previousReports=[],previousMessage='',day=dateToday()}){
 const explicit=wantsAnalysisVisual(message),result=[],seen=new Set();
 const push=c=>{const key=JSON.stringify(c);if(!seen.has(key)){seen.add(key);result.push(c)}};
 const run=args=>demoReport(bookings,args,day);
 const sources=reports.length?reports.map(r=>r.filters):explicit?[explicitArgs(message,day,previousReports.at(-1)?.filters)]:[];
 for(const input of sources.slice(0,3)){
  try{const args={...input,groupBy:null},r=run(args),base={from:args.from,to:args.to,filters:args,fictional:true,unpriced:r.unpricedCompleted+r.nonCadCompleted,future:r.futureCompleted,lowSample:r.records<10};
   const intent=/(渠道|channel|化妆师|artist|服务|service|状态|status|收入|金额|到账|收款|revenue|value|receipt)/i.test(message)?message:message+' '+previousMessage;
   const dimension=input.groupBy||(/(状态|status)/i.test(intent)?'status':/(渠道|channel)/i.test(intent)?'channel':/(化妆师|artist)/i.test(intent)?'artist':'service');
   const metric=/(收入|金额|营收|到账|收款|revenue|value|receipt|received)/i.test(intent)?/(到账|收款|received|receipt)/i.test(intent)&&!/(完成|completed)/i.test(intent)?'grossReceivedCents':'completedAmountCents':'records';
   const grouped=dimension==='status'?null:run({...args,groupBy:dimension});
   const mix=dimension==='status'?Object.entries(r.statusCounts).map(([label,value])=>({label,value})):grouped.groups.map(g=>({label:g.value,value:g[metric]}));
   if(/排期|日程|schedule|timeline/i.test(message)){
    const schedule=r.recordsSample.filter(b=>b.status!=='Cancelled').map(b=>{const minute=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'')?Number(t.slice(0,2))*60+Number(t.slice(3)):null;const start=minute(b.startTime),end=minute(b.endTime);return {label:b.date+' · '+b.id+' · '+(b.artistIds||[]).join(', '),status:b.status,start,end,value:0,time:start!==null&&end!==null&&end>start?b.startTime+'–'+b.endTime:null};});
    push({...base,kind:'schedule',title:'schedule',metric:'schedule',truncated:r.sampleTruncated||schedule.length>12,rows:schedule.slice(0,12)});continue;
   }
   if(explicit||mix.filter(g=>g.value>0).length>1)push({...base,kind:mix.filter(g=>g.value>0).length>6||dimension==='artist'||dimension==='channel'&&!/(饼图|圆环|占比|pie|donut|share)/i.test(message)?'bars':'donut',title:dimension,metric,rows:mix});
   if(/日报|daily|状态|status/i.test(message)&&dimension!=='status')push({...base,kind:'bars',title:'status',metric:'records',rows:Object.entries(r.statusCounts).map(([label,value])=>({label,value}))});
   if((!explicit&&/(收入|金额|营收|到账|收款|revenue|value|receipt|received)/i.test(message)||/(分析|情况|analy|dashboard|日报|daily)/i.test(message))&&(!/(订单数量|订单状态|order count|order status)/i.test(message)||/(日报|daily|收入|金额|到账|收款|revenue|value|receipt)/i.test(message))){
    push({...base,kind:'bars',title:'finance',metric:'cents',rows:[{label:'completed',value:r.completedAmountCents},{label:'receipts',value:r.grossReceivedCents}]});
    const groups=run({...args,groupBy:input.groupBy||'channel'});
    if(groups.groups.filter(g=>g.records||g.grossReceivedCents).length>1)push({...base,kind:'bars',title:input.groupBy||'channel',metric:'cents',paired:true,rows:cleanGroups(groups)});
   }
  }catch{ /* Invalid or unsupported report ranges must not produce an invented chart. */ }
 }
 if(reports.length>1){
  const scopes=new Set(reports.map(r=>JSON.stringify({...r.filters,groupBy:null})));
  if(scopes.size>1&&reports.every(r=>r.filters.from===reports[0].filters.from&&r.filters.to===reports[0].filters.to)){
   const count=!/(收入|金额|营收|到账|收款|revenue|value|receipt|received)/i.test(message);
   const comparisons=reports.map(s=>{const r=run({...s.filters,groupBy:null});return {label:Object.entries(s.filters).filter(([k,v])=>!['from','to','groupBy'].includes(k)&&v!==null).map(([,v])=>v).join(' · ')||'all',value:count?r.records:r.completedAmountCents,...(!count?{secondary:r.grossReceivedCents}:{})};});
   result.unshift({kind:'bars',title:'comparison',metric:count?'records':'cents',paired:!count,from:reports[0].filters.from,to:reports[0].filters.to,filters:{},rows:comparisons,fictional:true});
  }
  const key=a=>JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k])=>!['from','to','groupBy'].includes(k))));
  if(reports.every(r=>key(r.filters)===key(reports[0].filters))){
   const trend=[...new Map(reports.map(s=>{const r=run({...s.filters,groupBy:null});return {label:s.filters.from+' → '+s.filters.to,value:r.completedAmountCents,secondary:r.grossReceivedCents}}).map(r=>[r.label,r])).values()].sort((a,b)=>a.label.localeCompare(b.label));
   if(new Set(trend.map(r=>r.label)).size>1)result.unshift({kind:'trend',title:'trend',metric:'cents',paired:true,from:trend[0].label.slice(0,10),to:trend.at(-1).label.slice(-10),filters:reports[0].filters,rows:trend,fictional:true});
  }
 }
 return result[0]?.kind==='trend'||result[0]?.title==='comparison'?[result[0]]:result.slice(0,4);
}
export function chartCommentary(c,en=false){
 const rows=(c.rows||[]).filter(r=>Number.isSafeInteger(r.value)&&r.value>=0);
 if(!rows.length||c.kind==='schedule')return '';
 if(c.title==='finance'||c.paired)return en?'Completed value and gross receipts use different date meanings; they are not profit. Check payment and refund records.':'完成金额与到账原额的日期口径不同，不是利润。建议核对收款日期与退款记录。';
 const total=rows.reduce((sum,r)=>sum+r.value,0);
 const sorted=[...rows].sort((a,b)=>b.value-a.value);
 if(!total)return en?'No positive values in this period.':'当前范围没有正值数据，暂时不能分析结构。';
 const top=sorted[0],share=(top.value/total*100).toFixed(1);
 const format=n=>c.metric==='records'?String(n):(n/100).toLocaleString('en-CA',{style:'currency',currency:'CAD'});
 let observation=en?label(top.label,en)+' is the largest at '+share+'% of the chart total.':label(top.label,en)+'占图表合计的'+share+'%，为当前最大项。';
 if(c.kind==='trend'&&rows.length>1){
  const delta=rows.at(-1).value-rows[0].value;
  observation=en?'Displayed values changed by '+format(Math.abs(delta))+' ('+(delta>0?'increase':delta<0?'decrease':'unchanged')+').':'图中首尾数值'+(delta>0?'增加':delta<0?'减少':'未变化')+format(Math.abs(delta))+'。';
 }
 const suggestion=c.title==='channel'?'核对渠道带来的咨询质量与确认率':c.title==='artist'?'结合排班核对人员实际工作量':c.title==='service'?'对照相同季节的服务结构':c.kind==='trend'?'核对比较周期的长度和季节性':'核对对应记录并与可比时期的数据对照';
 return en?observation+' Suggested check: review comparable historical records before acting.':observation+' 建议'+suggestion+'；没有可比历史数据时，不能据此断言增长或下降。';
}
export function renderAnalysisCharts(charts,esc,en=false){
 if(!Array.isArray(charts)||!charts.length)return '';
 const t=(zh,english)=>en?english:zh,money=v=>'CAD '+(v/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
 const title={service:t('各类服务的数量或金额','Services by count or value'),channel:t('订单来源渠道对比','Order source comparison'),artist:t('主负责人订单分布','Orders by lead artist'),finance:t('做了多少金额，收到了多少','Completed value and money received'),status:t('订单目前走到哪一步','Where orders stand'),trend:t('金额怎样随时间变化','How amounts change over time'),schedule:t('每天谁在什么时间服务','Who is scheduled and when'),comparison:t('这些条件下，哪边更多','Compare these groups')};
 return '<div class="analysis-charts">'+charts.map(c=>{
  const rows=(c.rows||[]).filter(r=>Number.isSafeInteger(r.value)&&r.value>=0&&(r.secondary===undefined||Number.isSafeInteger(r.secondary)&&r.secondary>=0)),total=rows.reduce((n,r)=>n+r.value,0),fmt=v=>c.metric==='records'?v+' '+t('条','records'):money(v);
  const scope=Object.entries(c.filters||{}).filter(([k,v])=>!['from','to','groupBy'].includes(k)&&v!==null).map(([,v])=>label(v,en)).join(' · ');
  let plot='';
  if(c.kind==='donut'&&total){let cursor=0;const stops=rows.map((r,i)=>{const start=cursor;cursor+=r.value/total*360;return palette[i%palette.length]+' '+start+'deg '+cursor+'deg'});plot='<div class="analysis-donut" role="img" aria-label="'+esc(title[c.title]+' '+fmt(total))+'" style="background:conic-gradient('+stops.join(',')+')"><div><strong>'+esc(fmt(total))+'</strong><small>'+t('合计','Total')+'</small></div></div><div class="analysis-legend">'+rows.map((r,i)=>'<div><i style="background:'+palette[i%palette.length]+'"></i><span>'+esc(label(r.label,en))+'</span><strong>'+esc(fmt(r.value))+'</strong><small>'+(r.value/total*100).toFixed(1)+'%</small></div>').join('')+'</div>';}
  else if(c.kind==='donut')plot='<p class="analysis-empty">'+t('当前范围没有可绘制的正值数据。','No positive values in this scope.')+'</p>';
  else if(c.kind==='schedule'){
   plot=rows.length?'<div class="analysis-hours"><span>00:00</span><span>12:00</span><span>24:00</span></div>'+rows.map(r=>'<div class="analysis-schedule-row"><span>'+esc(r.label)+'</span><div class="analysis-track">'+(r.time?'<i style="margin-left:'+r.start/1440*100+'%;width:'+(r.end-r.start)/1440*100+'%"></i>':'')+'</div><strong>'+esc(r.time||t('时间待确认','Time unconfirmed'))+' · '+esc(label(r.status,en))+'</strong></div>').join(''):'<p class="analysis-empty">'+t('当前范围没有未取消的排期。','No active schedules in this scope.')+'</p>';
   if(c.truncated)plot+='<p>'+t('仅展示前 12 条，完整排期请看订单列表。','Showing up to 12 records; see the booking list for all schedules.')+'</p>';
  }
  else if(c.kind==='trend'){
   const max=Math.max(1,...rows.flatMap(r=>[r.value,r.secondary||0])),x=i=>35+i*430/Math.max(1,rows.length-1),y=v=>160-v/max*130;
   plot='<div class="analysis-series">'+t('深色：完成金额 · 浅色：到账原额','Dark: completed value · light: gross receipts')+'</div><svg class="analysis-line" viewBox="0 0 500 190" role="img" aria-label="'+esc(title.trend)+'"><path d="M35 20V160H470" stroke="#dfe4dc" fill="none"/><polyline class="line-a" fill="none" stroke-width="3" points="'+rows.map((r,i)=>x(i)+','+y(r.value)).join(' ')+'"/><polyline class="line-b" fill="none" stroke-width="3" points="'+rows.map((r,i)=>x(i)+','+y(r.secondary||0)).join(' ')+'"/>'+rows.map((r,i)=>'<circle cx="'+x(i)+'" cy="'+y(r.value)+'" r="4" fill="#40584c"><title>'+esc(r.label+' '+money(r.value))+'</title></circle><text x="'+x(i)+'" y="182" text-anchor="middle">'+esc(r.label.slice(0,7))+'</text>').join('')+'</svg><div class="analysis-legend">'+rows.map(r=>'<div><i style="background:#40584c"></i><span>'+esc(r.label)+'</span><strong>'+esc(money(r.value))+'</strong><small>'+esc(money(r.secondary||0))+'</small></div>').join('')+'</div>';
  }
  else{const max=Math.max(1,...rows.flatMap(r=>[r.value,r.secondary||0]));plot=(c.paired?'<div class="analysis-series">'+t('深色：完成金额 · 浅色：到账原额','Dark: completed value · light: gross receipts')+'</div>':'')+rows.map(r=>'<div class="analysis-bar-row"><span>'+esc(({completed:t('完成金额','Completed value'),receipts:t('到账原额','Gross receipts')})[r.label]||r.label.split(' · ').map(v=>label(v,en)).join(' · '))+'</span><div><div class="analysis-track"><i style="width:'+r.value/max*100+'%"></i></div>'+ (c.paired?'<div class="analysis-track secondary"><i style="width:'+(r.secondary||0)/max*100+'%"></i></div>':'')+'</div><strong>'+esc(fmt(r.value))+(c.paired?'<small>'+esc(fmt(r.secondary||0))+'</small>':'')+'</strong></div>').join('');}
  return '<section class="analysis-card" data-analysis-chart="'+esc(c.kind)+'"><h4>'+esc(title[c.title])+'</h4><p class="analysis-scope">'+esc(c.from+' → '+c.to+(scope?' · '+scope:''))+'</p><p class="analysis-metric">'+t(c.metric==='schedule'?'服务日期与时间 · 多伦多当地时间':c.metric==='records'?'订单记录数（含取消）':c.paired||c.title==='finance'?'完成金额／到账原额 · CAD':c.metric==='grossReceivedCents'?'到账原额 · CAD':'已完成订单金额 · CAD',c.metric==='schedule'?'Service date and time · Toronto local time':c.metric==='records'?'Order records (including cancellations)':c.paired||c.title==='finance'?'Completed value / gross receipts · CAD':c.metric==='grossReceivedCents'?'Gross receipts · CAD':'Completed booking value · CAD')+'</p>'+plot+'<p class="analysis-note">'+t('程序计算 · 虚构测试数据（300 单基线）。','Calculated · 300 fictional test records.')+(c.metric==='records'||c.metric==='schedule'?'':t(' 到账原额未扣退款，不是利润。',' Gross receipts exclude refund adjustments, not profit.'))+(c.lowSample?t(' 样本少，只描述当前记录。',' Small sample: describe these records only.'):'')+(c.unpriced&&c.metric!=='records'&&c.metric!=='schedule'&&c.metric!=='grossReceivedCents'?t(' 有未知价格或非 CAD 金额，金额不完整。',' Missing prices: value is incomplete.'):'')+(c.future?t(' 含未来日期完成状态，需核对。',' Future completed statuses require review.'):'')+'</p><p class="analysis-commentary">'+esc(chartCommentary(c,en))+'</p><p class="analysis-guide">'+t(c.kind==='schedule'?'横条表示服务时间；咨询中的排期仍待确认，需另行核对冲突与路程。':c.kind==='donut'?'看各部分占合计多少。':c.kind==='trend'?'看金额随时间的变化；先留意每段日期是否长度相同。':c.metric==='records'?'柱子越长，订单越多。':'柱子越长，金额越多；完成金额与到账不同，不等于欠款或利润。',c.kind==='schedule'?'Bars show service times; inquiry schedules are tentative. Check conflicts and travel separately.':c.kind==='donut'?'See each share of the total.':c.kind==='trend'?'Compare changes over time; check whether periods have equal length.':c.metric==='records'?'Longer bars mean more orders.':'Longer bars mean more value; the difference is not debt or profit.')+'</p></section>';
 }).join('')+'</div>';
}
