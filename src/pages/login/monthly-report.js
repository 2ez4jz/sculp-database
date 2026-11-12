import { intakeRpc } from '../../services/cloud-intake.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cadFromCents(value) {
  if(typeof value!=='string'||!/^\d+$/.test(value))throw Error('月报金额格式无效。');
  const cents=BigInt(value), dollars=(cents/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return `CAD ${dollars}.${(cents%100n).toString().padStart(2,'0')}`;
}
export function mountMonthlyReport({root,supabase}) {
  let destroyed=false,version=0;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  const month=parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
  root.innerHTML=`<details class="cloud-intake"><summary>云端经营月报</summary>
    <p class="cloud-note">正式云端数据，由数据库计算。服务月与收款月分开，未知价格不作为零金额。</p>
    <form data-report-form><label>月份 · 多伦多时间<input name="month" type="month" min="2000-01" max="2099-12" value="${month}" required></label>
    <button class="auth-secondary" type="submit">查询月报</button></form>
    <p data-report-status role="status" aria-live="polite"></p><div data-report-result></div></details>`;
  const $=s=>root.querySelector(s);
  $('[name=month]').oninput=()=>{
    version++;$('[data-report-result]').replaceChildren();
    $('[data-report-status]').textContent='月份已变化，请查询月报。';
  };
  $('[data-report-form]').onsubmit=event=>{event.preventDefault();void load();};
  async function load() {
    const mine=++version,requested=$('[name=month]').value;
    $('[data-report-status]').textContent='正在读取云端月报…';
    $('[data-report-result]').replaceChildren();
    try {
      const data=await intakeRpc(supabase,'sculpy_monthly_report',{p_month:requested});
      if(destroyed||mine!==version)return;
      if(data.month!==requested)throw Error('月报月份不一致，请重试。');
      const b=data.bookings,r=data.receipts;
      $('[data-report-result]').innerHTML=`<h4>${esc(data.month)} 经营月报</h4>
        <dl class="cloud-report-metrics"><dt>服务月订单数（不含取消）</dt><dd>${esc(b.total)}</dd>
        <dt>待确认 / 已确认 / 已完成 / 已取消</dt><dd>${esc(b.inquiry)} / ${esc(b.confirmed)} / ${esc(b.completed)} / ${esc(b.cancelled)}</dd>
        <dt>服务月完成订单金额</dt><dd>${cadFromCents(b.completedAmountCents)}</dd>
        <dt>收款月到账原额（未扣退款）</dt><dd>${cadFromCents(r.grossAmountCents)}</dd></dl>
        <p class="cloud-note">完成订单金额采用服务明细合计，无明细时采用已确定成交价；不代表收款或净利润。
        到账原额按实际付款日期统计，含后来退款的原始付款；不是退款后的净收款。</p>
        <p data-report-warnings>未定价完成订单：${esc(b.unpriced)}；非 CAD 完成订单：${esc(b.nonCadCompleted)}（未计金额）；
        退款需核对：${esc(r.refundReviewCount)} 笔；非 CAD 收款：${esc(r.nonCadCount)}（未计金额）；
        全部历史缺付款日期：${esc(data.undatedReceiptCount)} 笔（未分配月份）。</p>`;
      $('[data-report-status]').textContent='数据读取时间：'+new Date(data.asOf).toLocaleString('zh-CN',{timeZone:'America/Toronto'})+' · 多伦多时间';
    } catch(error) { if(!destroyed&&mine===version) { $('[data-report-result]').replaceChildren();$('[data-report-status]').textContent=error.message; } }
  }
  return {destroy(){destroyed=true;version++;root.replaceChildren();}};
}
