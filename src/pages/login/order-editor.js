import { intakeRpc } from '../../services/cloud-intake.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses = {inquiry:'待确认需求',confirmed:'已确认',completed:'已完成',cancelled:'已取消'};
const fields = [
  ['date','服务日期','date'], ['time','开始时间 · 多伦多时间','time'],
  ['endDate','结束日期（未知留空）','date'], ['endTime','结束时间（未知留空）','time'],
  ['location','服务地点','text'], ['details','服务需求','textarea'],
];

export function mountOrderEditor({root, supabase, bookingId, edit, onSaved}) {
  let destroyed = false, pending = null, saving = false, review = null, saved = false;
  root.innerHTML = `<details class="cloud-intake"><summary>修改订单</summary>
    <p class="cloud-note">先修改，再核对前后内容。金额、付款、客户和人员分配不在此处修改。</p>
    <p class="cloud-note">待确认需求须先确认才能完成。已完成或取消的订单，须先重新设为待确认需求才能再次确认。</p>
    <form data-edit-form><div class="intake-fields">${fields.map(([key,label,type]) =>
      `<label>${label}${type==='textarea'
        ? `<textarea name="${key}" maxlength="2000">${esc(edit[key])}</textarea>`
        : `<input name="${key}" type="${type}" value="${esc(edit[key])}" ${key==='location'?'maxlength="500"':''} ${['date','time'].includes(key)?'required':''}>`}</label>`).join('')}
      <label>订单状态<select name="status">${Object.entries(statuses).map(([key,label])=>
        `<option value="${key}" ${edit.status===key?'selected':''}>${label}</option>`).join('')}</select></label></div>
    <label>修改依据或原因<textarea name="reason" maxlength="2000" required></textarea></label>
    <button type="submit" class="auth-secondary">核对修改</button></form>
    <div data-change-review></div><p data-edit-status role="status" aria-live="polite"></p></details>`;
  const $ = selector => root.querySelector(selector), form = $('[data-edit-form]');
  const status = message => { if (!destroyed) $('[data-edit-status]').textContent = message; };
  const freeze = value => form.querySelectorAll('input,select,textarea,button').forEach(el => { el.disabled=value; });
  form.oninput = () => { review=null; $('[data-change-review]').replaceChildren(); status('内容已变化，请重新核对。'); };
  form.onsubmit = event => {
    event.preventDefault();
    if (saving || pending || saved || destroyed) return;
    const payload=Object.fromEntries([...fields.map(f=>f[0]),'status'].map(k=>[k,form.elements[k].value]));
    const changed = [...fields.map(([key,label])=>[key,label]),['status','订单状态']]
      .filter(([key])=>payload[key]!==edit[key]);
    if(!changed.length) { status('订单内容未变化，无需保存。'); return; }
    review={p_request_id:crypto.randomUUID(),p_booking_id:bookingId,p_expected_version:edit.version,
      p_payload:{...payload,confirmed:true},p_reason:form.elements.reason.value};
    $('[data-change-review]').innerHTML=`<h4>确认以下修改</h4><ul>${changed.map(([key,label])=>
      `<li><strong>${label}</strong><p>原来：${esc(key==='status'?statuses[edit[key]]:edit[key]||'未填写')}</p>
      <p>修改为：${esc(key==='status'?statuses[payload[key]]:payload[key]||'未填写')}</p></li>`).join('')}</ul>
      <button type="button" class="auth-primary" data-confirm-change>确认保存修改</button>
      <button type="button" class="auth-secondary" data-cancel-change>取消本次修改</button>`;
    $('[data-confirm-change]').onclick=()=>{ void save(); };
    $('[data-cancel-change]').onclick=()=>{ review=null; $('[data-change-review]').replaceChildren(); status('已取消，未保存修改。'); };
    status('请核对修改前后内容，确认后才更新云端订单。');
  };
  async function save() {
    if (saving || destroyed || saved || (!review && !pending)) return;
    pending??=review;
    saving=true; freeze(true);
    $('[data-confirm-change]').disabled=true;
    $('[data-cancel-change]').disabled=true;
    status('正在保存修改…');
    try {
      const result=await intakeRpc(supabase,'sculpy_confirm_booking_change',pending);
      if(destroyed)return;
      saved=true; status('修改已保存，正在重新读取订单…');
      try { await onSaved(result.bookingId); if(!destroyed)status('修改已保存，其他设备可重新读取。'); }
      catch { status('修改已保存，但重新读取失败。请重新查询订单。'); }
    } catch(error) {
      if(destroyed)return;
      if(error.code==='40001') {
        status('另一窗口已修改订单。请重新查询订单，按最新内容核对；本次未保存。');
        // Require a fresh detail read, never automatically overwrite a conflict.
        $('[data-change-review]').replaceChildren(); pending=null; review=null;
      } else if (/^(22|23|42|P0)/.test(error.code||'')) {
        pending=null;review=null;freeze(false);$('[data-change-review]').replaceChildren();status(error.message);
      } else {
        status('尚未收到成功确认。'+error.message+' 请重试同一笔修改。');
        const button=$('[data-confirm-change]');button.disabled=false;button.textContent='重试同一笔修改';
      }
    } finally { saving=false; }
  }
  return {
    // Refuse navigation while a response is uncertain: keep its replay key.
    canLeave:()=>saved || (!saving && !pending),
    destroy(){destroyed=true;root.replaceChildren();},
  };
}
