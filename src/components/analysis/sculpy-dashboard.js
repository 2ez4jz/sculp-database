import {buildAnalysisCharts,renderAnalysisCharts} from '../analysis/charts.js?v=dates-model-venue-20261015';
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validDate=value=>/^20\d{2}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export const validDashboardRange=({from,to})=>validDate(from)&&validDate(to)&&from<=to;
export function dashboardRange(preset,day=today()){
 const year=day.slice(0,4),month=day.slice(0,7);
 if(preset==='month')return {from:month+'-01',to:day};
 if(preset==='last-month'){
  const end=new Date(Date.UTC(Number(year),Number(day.slice(5,7))-1,0)).toISOString().slice(0,10);
  return {from:end.slice(0,7)+'-01',to:end};
 }
 return {from:year+'-01-01',to:year+'-12-31'};
}
export function buildDashboardCharts(bookings,range,day=today()){
 if(!validDashboardRange(range))throw RangeError('Invalid dashboard range');
 const filters={...range,service:null,channelId:null,artistId:null,bookingId:null,status:null,groupBy:null};
 return ['服务订单占比','各渠道收款金额饼图','化妆师订单占比'].flatMap(message=>buildAnalysisCharts({message,bookings,day,reports:[{filters}]}).slice(0,1));
}
export function createSculpyDashboard({getBookings,isAllowed,english=()=>false}){
 let range=dashboardRange('year');
 function render(){
  const root=document.getElementById('sculpy-dashboard');
  if(!root)return;
  if(!isAllowed()){root.hidden=true;root.innerHTML='';return;}
  root.hidden=false;
  const en=english(),t=(zh,eng)=>en?eng:zh;
  const charts=buildDashboardCharts(getBookings(),range,today());
  const content=renderAnalysisCharts(charts,htmlEscape,en)||'<p class="sculpy-dashboard-empty" role="status">'+t('当前没有可显示的图表数据。','No chart data available.')+'</p>';
  root.innerHTML='<div class="sculpy-dashboard-heading"><div><span class="eyebrow">SCULP STUDIO · INSIGHTS</span><h2>'+t('工作室经营概览','Studio overview')+'</h2><p>'+t('选择日期范围，三张图同步更新。','Choose a date range for all three charts.')+'</p></div></div>'+
   '<form class="dashboard-date-form" data-dashboard-dates><label>'+t('开始日期','Start date')+'<input type="date" name="from" required min="2000-01-01" max="2099-12-31" value="'+range.from+'"></label><label>'+t('结束日期','End date')+'<input type="date" name="to" required min="2000-01-01" max="2099-12-31" value="'+range.to+'"></label><button type="submit" class="primary">'+t('应用','Apply')+'</button><div class="dashboard-date-presets">'+[['month',t('本月至今','Month to date')],['last-month',t('上月','Last month')],['year',t('今年全年','Full year')]].map(([id,label])=>'<button type="button" data-dashboard-preset="'+id+'">'+label+'</button>').join('')+'</div><p class="dashboard-date-error" data-dashboard-date-error role="alert" hidden></p></form>'+
   '<p class="dashboard-date-scope" role="status">'+t('当前范围：','Showing: ')+range.from+' → '+range.to+t('（含首尾两天）。订单按服务日期，收款按实际到账日期统计。',' (both dates included). Orders use service dates; receipts use payment dates.')+'</p><div class="sculpy-dashboard-grid">'+content+'</div>';
  root.querySelector('[data-dashboard-dates]').onsubmit=event=>{
   event.preventDefault();
   if(!isAllowed()){render();return;}
   const form=event.currentTarget,next={from:form.elements.from.value,to:form.elements.to.value};
   if(!validDashboardRange(next)){
    const error=root.querySelector('[data-dashboard-date-error]');error.hidden=false;
    error.textContent=t('请选择有效日期，结束日期不能早于开始日期。','Choose valid dates. End date must be on or after start date.');return;
   }
   range=next;render();
  };
  root.querySelectorAll('[data-dashboard-preset]').forEach(button=>button.onclick=()=>{range=dashboardRange(button.dataset.dashboardPreset);render();});
 }
 return {render,reset:render};
}
