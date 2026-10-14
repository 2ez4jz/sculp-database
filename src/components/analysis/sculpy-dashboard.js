import {buildAnalysisCharts,renderAnalysisCharts} from '../analysis/charts.js';
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function createSculpyDashboard({getBookings,isAllowed,english=()=>false}){
 function render(){
  const root=document.getElementById('sculpy-dashboard');
  if(!root)return;
  if(!isAllowed()){root.hidden=true;root.innerHTML='';return;}
  root.hidden=false;
  const rows=getBookings(),day=today();
  const questions=['300单服务订单占比','300单各渠道收款金额饼图','300单化妆师订单占比'];
  const charts=questions.flatMap(message=>buildAnalysisCharts({message,bookings:rows,day}).slice(0,1));
  const content=renderAnalysisCharts(charts,htmlEscape,english())||'<p class="sculpy-dashboard-empty" role="status">'+(english()?'No chart data available.':'当前没有可显示的图表数据。')+'</p>';
  root.innerHTML='<div class="sculpy-dashboard-heading"><div><span class="eyebrow">SCULP STUDIO · INSIGHTS</span><h2>'+(english()?'Studio overview':'工作室经营概览')+'</h2><p>'+(english()?'Fixed studio overview':'固定经营概览 · 前往 Sculpy 助手提问，查看详细分析')+'</p></div></div><div class="sculpy-dashboard-grid">'+content+'</div>';
 }
 return {render,reset:render};
}
