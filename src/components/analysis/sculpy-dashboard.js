import {buildAnalysisCharts,renderAnalysisCharts} from '../analysis/charts.js';
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function createSculpyDashboard({getBookings,isAllowed,english=()=>false,renderLegacy=()=>''}){
 let latest=null;
 let dismissedTurn=null;
 const defaults=()=>{
  const rows=getBookings(),day=today();
  const questions=['300单服务订单占比','300单各渠道收款金额饼图','300单化妆师订单占比'];
  return questions.flatMap(message=>buildAnalysisCharts({message,bookings:rows,day}).slice(0,1));
 };
 function render(turns=[]){
  const root=document.getElementById('sculpy-dashboard');
  if(!root)return;
  if(!isAllowed()){
   root.hidden=true;
   root.innerHTML='';
   return;
  }
  root.hidden=false;
  const newest=[...turns].reverse().find(t=>(Array.isArray(t.analysisCharts)&&t.analysisCharts.length)||t.chartKey);
  if(newest&&newest!==dismissedTurn){
   latest=Array.isArray(newest.analysisCharts)&&newest.analysisCharts.length?{charts:newest.analysisCharts}:{legacy:renderLegacy(newest)};
   dismissedTurn=null;
  }
  const charts=latest?.charts||defaults();
  const chartMarkup=latest?.legacy||renderAnalysisCharts(charts,htmlEscape,english());
  const chartContent=chartMarkup||'<p class="sculpy-dashboard-empty" role="status">'+(english()?'No chart data available for this selection. Try another date range.':'当前筛选条件下没有可显示的图表数据，请尝试其他时间范围。')+'</p>';
  root.innerHTML='<div class="sculpy-dashboard-heading"><div><span class="eyebrow">SCULP STUDIO · INSIGHTS</span><h2>'+ (english()?'Studio overview':'工作室经营概览')+'</h2><p>'+(latest?(english()?'Charts from your latest analysis question':'根据最近一次分析问题更新'):(english()?'Overview of fictional sample records':'基于虚构测试订单的默认图表'))+'</p></div><button type="button" data-dashboard-reset'+(!latest?' disabled':'')+'>'+(english()?'Reset overview':'恢复默认图表')+'</button></div><div class="sculpy-dashboard-grid">'+chartContent+'</div>';
  root.querySelector('[data-dashboard-reset]')?.addEventListener('click',()=>{dismissedTurn=newest||null;latest=null;render(turns)});
 }
 return {render,reset:()=>{latest=null;dismissedTurn=null;render([])}};
}
