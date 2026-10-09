import {monthlyStats} from "./monthly-stats.js";
const MONTH=/20\d{2}-(?:0[1-9]|1[0-2])/g;
export function analyzeMonthlyQuestion(message,records,context){
 const q=String(message||"");
 // Preserve the existing service-revenue pie chart route; it has different grouping.
 if(/(?:饼图|pie)/i.test(q)&&/(?:服务|service)/i.test(q))return null;
 if(!/(订单|收入|营收|销售额|业绩|月份|月度|bookings?|revenue|sales|monthly)/i.test(q))return null;
 if(!/(月|month|季度|quarter|趋势|trend|收入|营收|revenue)/i.test(q))return null;
 if(context.role!=="admin")return {answer:"全局经营统计仅对管理人员开放。",references:[],proposals:[],sourceIds:[]};
 let months=[...new Set(records.map(b=>String(b.date||"").slice(0,7)).filter(x=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(x)))].sort();
 const explicit=[...q.matchAll(MONTH)].map(m=>m[0]);
 const c=q.match(/(?:最近|过去|近|last)\s*([一二三四五六]|\d+)\s*(?:个)?(?:月|months?)/i);
 const chinese={一:1,二:2,三:3,四:4,五:5,六:6};
 const count=c?Number(chinese[c[1]]||c[1]):3;
 if(explicit.length){months=explicit.filter((x,i,a)=>a.indexOf(x)===i).sort();}
 else if(/上(?:一)?个?月|last month/i.test(q)){months=months.length>=2?[months[months.length-2]]:[];}
 else if(/本月|这个月|当月|this month/i.test(q)){months=months.length?[months.at(-1)]:[];}
 else if(c&&count>=1&&count<=12){
  const anchor=months.at(-1);
  if(anchor){const [y,m]=anchor.split("-").map(Number);months=Array.from({length:count},(_,i)=>{const d=new Date(Date.UTC(y,m-count+i,1));return d.toISOString().slice(0,7);});}
 } else months=months.slice(-3);
 if(!months.length)return {answer:"目前没有可用的月份记录，无法生成统计。",references:[],proposals:[],sourceIds:[]};
 const rows=months.map(month=>monthlyStats(records,month,context));
 const format=cents=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(cents/100);
 const lines=rows.map(r=>r.month+"："+r.bookings+" 单，已完成 "+r.completed+" 单，已完成订单金额 "+format(r.amountCents)+(r.unpriced?"（"+r.unpriced+" 笔已完成订单缺少有效标价）":""));
 const total=rows.reduce((a,r)=>a+r.bookings,0);
 const notes=[];
 if(rows.some(r=>r.unpriced)) notes.push("有已完成订单缺少有效标价，金额合计不完整。");
 if(total<20) notes.push("样本较少，不宜据此判断长期经营趋势。");
 const wantsInsight=/(分析|原因|为什么|发现|值得|建议|洞察|insight|why|analy)/i.test(q);
 return {answer:"按服务日期统计（虚构数据）：\n"+lines.join("\n")+"\n金额是已完成订单的标价合计，不是实际收款或利润。"+(wantsInsight?"\n\nAI 探索性分析："+(notes.join(" ")||"目前没有足够证据提出可靠的额外经营结论。"):""),chartKey:"monthly-analytics",chartRows:rows,references:[],proposals:[],sourceIds:[]};
}
export function renderMonthlyChatChart(rows,esc){
 if(!Array.isArray(rows)||!rows.length)return "";
 const max=Math.max(1,...rows.map(r=>r.amountCents));
 const fmt=n=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(n/100);
 return '<section class="sculpy-monthly-chart" aria-label="月度经营数据图表"><strong>月度已完成订单金额 · CAD</strong>'+rows.map(r=>'<div style="display:grid;grid-template-columns:70px 1fr 100px;align-items:center;gap:8px;margin-top:10px"><span>'+esc(r.month)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+r.amountCents/max*100+'%"></div></div><span>'+esc(fmt(r.amountCents))+'</span></div>').join('')+'<small>程序计算 · 虚构订单 · 非实收金额</small></section>';
}
