import { monthlyStats } from "../../domain/monthly-stats.js";
export function renderMonthlyAnalytics({records,context,esc,money}) {
  if(context.role !== "admin") return "";
  const months = [...new Set(records.map(b=>String(b.date||"").slice(0,7)).filter(x=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(x)))].sort().reverse().slice(0,6);
  if(!months.length)return "";
  const rows=months.map(month=>monthlyStats(records,month,context)).reverse();
  const max=Math.max(1,...rows.map(r=>r.amountCents));
  const table=rows.map(r=>'<tr><td>'+esc(r.month)+'</td><td>'+r.bookings+'</td><td>'+r.completed+'</td><td>'+money(r.amountCents/100)+'</td><td>'+r.unpriced+'</td></tr>').join('');
  const bars=rows.map(r=>'<div style="display:grid;grid-template-columns:75px 1fr 110px;gap:10px;align-items:center;font-size:12px"><span>'+esc(r.month)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+(r.amountCents/max*100)+'%"></div></div><strong>'+money(r.amountCents/100)+'</strong></div>').join('');
  return '<section class="panel" data-monthly-analytics><div class="section-head"><div><div class="eyebrow">VERIFIED METRICS · FICTIONAL DEMO</div><h2>月度订单分析</h2></div><span class="pill">程序统计</span></div><p class="small muted">虚构数据。金额为已完成订单标价总额，不是实收或利润；无效价格单独统计。</p><div class="table-wrap"><table><thead><tr><th>月份</th><th>订单</th><th>已完成</th><th>已完成订单金额</th><th>价格缺失</th></tr></thead><tbody>'+table+'</tbody></table></div><div style="display:grid;gap:10px;margin-top:18px">'+bars+'</div></section>';
}
