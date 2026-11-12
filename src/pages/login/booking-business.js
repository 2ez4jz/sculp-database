import {intakeRpc,cloudWriteFailure} from '../../services/cloud-intake.js?v=cloud-write-20261022';
import {esc,money,today} from './wedding-dashboard.js';
export function mountBookingBusiness({root,supabase,bookingId,onSaved}){
 let alive=true,pending=null,saving=false,saved=false,needsRefresh=false;
 const paymentNames={deposit:'定金',balance:'尾款',refund:'退款',unclassified:'旧收款（待分类）'};
 const names={confirmation:'正式签约',amendment:'合同变更',cancellation:'取消',reschedule:'改期',completion:'完成',baseline:'上线基线'};
 async function load(){root.textContent='正在读取合同和收款…';try{
  const d=await intakeRpc(supabase,'sculpy_wedding_detail',{p_id:bookingId});if(!alive)return;
  if(d.contractRole==='included'){root.innerHTML='<p class="cloud-note">此场服务包含在主合同中，不另计签约金额或收款。</p>';return;}
  root.innerHTML=`<details open class="cloud-intake w23-business"><summary>合同与收款</summary><dl class="w23-metrics"><div><dt>应收合同总额</dt><dd>${esc(money(d.amountCents))}</dd></div><div><dt>累计净收款</dt><dd>${esc(money(d.receivedCents))}</dd></div><div><dt>尚未收款</dt><dd>${esc(money(d.outstandingCents))}</dd></div></dl><p>签约日期：${esc(d.confirmedAt?new Date(d.confirmedAt).toLocaleDateString('zh-CN',{timeZone:'America/Toronto'}):'未知，不计精确签约同期比较')} · ${esc(d.currency)}</p>
  <form data-business-form><div class="intake-fields"><label>经营操作<select name="action">${d.status==='inquiry'?'<option value="confirm_contract">老板确认正式签约（无需先收定金）</option><option value="include_service">此项服务已包含在另一主合同</option>':''}${['confirmed','completed'].includes(d.status)?'<option value="amend_contract">变更合同总额（含追加服务）</option><option value="cancel_contract">取消合同</option>':''}${d.status!=='inquiry'?'<option value="record_payment">记录定金、尾款或退款</option>':''}</select></label><label data-amount>合同总额 / 本次收退款金额（CAD）<input name="amount" type="number" min="0" step="0.01" value="${d.amountCents==null?'':Number(d.amountCents)/100}"></label><label data-date>实际业务日期 · 多伦多<input name="date" type="date" max="${today()}" value="${today()}"></label><label data-unknown><input name="unknown" type="checkbox">历史签约日期无法核实</label><label data-parent hidden>同客户主合同 UUID<input name="parentId"></label><label data-payment hidden>收退款类型<select name="kind"><option value="deposit">定金</option><option value="balance">尾款</option><option value="refund">退款</option></select></label><label data-payment hidden>支付方式<select name="method"><option value="etransfer">e-Transfer</option><option value="cash">现金</option><option value="credit_card">信用卡</option><option value="bank_transfer">转账</option><option value="debit_card">借记卡</option><option value="other">其他</option></select></label><label data-payment hidden>原收款（退款必选）<select name="refundOf"><option value="">请选择</option>${d.payments.filter(p=>p.payment_kind!=='refund'&&['succeeded','refunded','partially_refunded'].includes(p.status)).map(p=>`<option value="${esc(p.id)}">${esc(paymentNames[p.payment_kind]||p.payment_kind)} · CA$${esc(p.amount)} · ${esc(p.paid_at?.slice(0,10))}</option>`).join('')}</select></label><label data-payment hidden>发票（多张发票时指定）<select name="invoiceId"><option value="">自动选择已有单张发票</option>${[...new Set(d.payments.map(p=>p.invoice_id))].map(id=>`<option>${esc(id)}</option>`).join('')}</select></label><label data-payment hidden>转账编号（可选，防重复）<input name="reference" maxlength="300"></label></div><label>依据 / 备注<textarea name="reason" maxlength="2000" required placeholder="确认订单的原始消息日期、追加服务内容或收款凭据"></textarea></label><label class="intake-consent"><input type="checkbox" name="confirmed" required>我已核对实际日期、金额及操作内容</label><button class="auth-primary">确认保存</button></form><p data-business-status role="status"></p>
  <details><summary>收退款记录（${d.payments.length}）</summary>${d.payments.map(p=>`<p>${esc(paymentNames[p.payment_kind]||p.payment_kind)} · CA$${esc(p.amount)} · ${esc(p.paid_at?.slice(0,10)||'日期未知')} · ${esc({succeeded:"成功",refunded:"原收款已退款",partially_refunded:"原收款部分退款",pending:"待处理",failed:"失败"}[p.status]||p.status)}${p.refund_of?' · 退款关联原收款':''}</p>`).join('')||'<p>尚无收款记录；已签约可以没有定金。</p>'}</details>
  <details><summary>合同历史（${d.history.length}）</summary>${d.history.map(e=>`<p><strong>${esc(names[e.event_type]||e.event_type)}</strong> · ${esc(e.effective_at?new Date(e.effective_at).toLocaleDateString('zh-CN',{timeZone:'America/Toronto'}):'业务日期未知')} · ${e.amount==null?'金额未知':'CA$'+esc(e.amount)} · ${esc(e.evidence)}</p>`).join('')}</details></details>`;
  const form=root.querySelector('form'),$=s=>root.querySelector(s),msg=s=>{if(alive)$('[data-business-status]').textContent=s;};
  function actionChanged(){const action=form.elements.action.value,payment=action==='record_payment',include=action==='include_service';root.querySelectorAll('[data-payment]').forEach(x=>x.hidden=!payment);$('[data-amount]').hidden=include||action==='cancel_contract';$('[data-date]').hidden=include;$('[data-parent]').hidden=!include;$('[data-unknown]').hidden=action!=='confirm_contract';form.elements.confirmed.checked=false;if(payment)form.elements.amount.value='';else form.elements.amount.value=d.amountCents==null?'':Number(d.amountCents)/100;}
  form.elements.action.onchange=actionChanged;actionChanged();
  form.oninput=()=>{form.elements.confirmed.checked=false;};form.elements.confirmed.oninput=e=>e.stopPropagation();
  form.onsubmit=async e=>{e.preventDefault();if(saving||saved||needsRefresh||!alive)return;
   if(!pending){const action=form.elements.action.value,payload={bookingId,reason:form.elements.reason.value,confirmed:true};
    if(action==='record_payment')Object.assign(payload,{kind:form.elements.kind.value,amount:form.elements.amount.value,paidAt:form.elements.date.value,method:form.elements.method.value,reference:form.elements.reference.value,refundOf:form.elements.refundOf.value||null,invoiceId:form.elements.invoiceId.value||null});
    else if(action==='include_service')Object.assign(payload,{version:d.version,parentId:form.elements.parentId.value});
    else Object.assign(payload,{version:d.version,amount:form.elements.amount.value||null,effectiveAt:action==='confirm_contract'&&form.elements.unknown.checked?null:form.elements.date.value,...(action==='confirm_contract'?{dateQuality:form.elements.unknown.checked?'unknown':'verified'}:{})});
    pending={p_request_id:crypto.randomUUID(),p_action:action,p_payload:payload};}
   saving=true;form.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=true);msg('保存中…');
   try{
    await intakeRpc(supabase,'sculpy_wedding_command',pending);
    // Once acknowledged, a failed read must never turn into another payment.
    pending=null;saved=true;saving=false;
    if(!alive)return;
    msg('已保存，正在重新读取订单…');
    try{await onSaved(bookingId);msg('已保存并重新读取订单。');}
    catch{msg('已保存，但重新读取失败。请重新查询订单，勿重复收退款或签约。');}
   }
   catch(error){if(!alive)return;if(cloudWriteFailure(error)==='refresh'){pending=null;needsRefresh=true;msg(error.message+' 请重新查询订单，按最新权限和内容核对；本次未保存。');}else if(cloudWriteFailure(error)==='rejected'){pending=null;form.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=false);form.elements.confirmed.checked=false;msg(error.message+' 请刷新订单后核对。');}else{const button=form.querySelector('button');button.disabled=false;button.textContent='重试同一笔操作';msg('尚未收到成功确认。'+error.message);}}
   finally{saving=false;}
  };
 }catch(e){if(alive)root.textContent='合同收款读取失败：'+e.message;}}
 void load();return {canLeave:()=>saved||(!pending&&!saving),destroy(){alive=false;root.replaceChildren();}};
}
