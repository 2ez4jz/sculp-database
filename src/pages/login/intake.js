import { config } from '../../config.js';
import {identifyCloudIntake,intakeRpc} from '../../services/cloud-intake.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountCloudIntake({root,supabase,onSaved}){
 let destroyed=false,version=0,recordedAt=null,requestId=null,pending=null,saving=false,lookupVersion=0;
 root.innerHTML=`<details class="cloud-intake"><summary>录入新订单</summary><p class="cloud-note">粘贴客户原话，逐项核对。确认后保存为待确认需求，预算不会作为成交价。</p><label>客户原话<textarea data-source maxlength="12000" placeholder="粘贴微信内容或语音转写"></textarea></label><small data-time></small><div class="intake-actions"><button type="button" data-identify>识别订单</button><button type="button" data-manual>填写确认卡片</button></div><p data-status role="status" aria-live="polite"></p><div data-review></div></details>`;
 const $=s=>root.querySelector(s),status=t=>{if(!destroyed)$('[data-status]').textContent=t};
 const source=$('[data-source]');
 if(!config.cloudIntakeAiEnabled){$('[data-identify]').hidden=true;status('AI 识别尚未启用，可手动核对后保存。');}
 function invalidate(){version++;lookupVersion++;requestId=null;pending=null;$('[data-review]').replaceChildren();}
 source.oninput=()=>{invalidate();recordedAt=new Date().toISOString();$('[data-time]').textContent='录入时间：'+new Date(recordedAt).toLocaleString('zh-CN');status('原文已更新，请重新识别或填写。');};
 const fields=[['clientName','客户姓名','text',100],['city','客户城市','text',100],['date','服务日期（请确认年份）','date',10],['time','开始时间 · 多伦多时间','time',5],['location','服务地点（可待定）','text',500],['details','服务需求','textarea',2000],['budget','预算 CAD（未知留空）','text',11]];
 async function review(draft={},warnings=[]){
  const mine=++version;requestId=crypto.randomUUID();pending=null;
  status('正在读取云端客户和服务目录…');
  try{
   const data=await intakeRpc(supabase,'sculpy_intake_lookup',{p_name:draft.clientName||''});
   if(destroyed||mine!==version)return;
   $('[data-review]').innerHTML=`<form data-form><h4>核对订单</h4><p class="cloud-note">${esc(warnings.join('；'))}</p><div class="intake-fields">${fields.map(([key,label,type,max])=>`<label>${label}${type==='textarea'?`<textarea name="${key}" maxlength="${max}">${esc(draft[key])}</textarea>`:`<input name="${key}" type="${type}" maxlength="${max}" value="${esc(draft[key])}" ${['clientName','date','time'].includes(key)?'required':''}>`}</label>`).join('')}<label>客户档案<select name="clientId"></select></label><button type="button" data-match>按姓名查找已有客户</button><label>服务类型<select name="serviceId" required><option value="">请选择</option>${data.services.map(s=>`<option value="${esc(s.id)}" ${s.code===draft.serviceCode?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>分配化妆师<select name="artistId"><option value="">人员待定</option>${data.artists.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label></div><p data-match-status class="cloud-note"></p><p class="cloud-note">未知结束时间和成交价留空；不会自动确认预约或付款。${draft.artistName?'原文提到负责人：'+esc(draft.artistName)+'，请手动核对分配。':''}</p><label class="intake-consent"><input name="confirmed" type="checkbox" required>我已核对原文、客户、日期与服务内容</label><button class="auth-primary" type="submit">确认保存到云端</button><button type="button" data-new hidden>录入下一单</button></form>`;
   const form=$('[data-form]');let matchedName=draft.clientName||'';
   function matches(rows){form.elements.clientId.innerHTML=rows.length?'<option value="">请选择已有客户</option>'+rows.map(c=>`<option value="${esc(c.id)}">${esc(c.display_name)} · ${esc(c.city||'城市未填写')} · ${esc(c.id.slice(0,8))}</option>`).join(''):'<option value="">新建客户档案</option>';form.elements.clientId.required=rows.length>0;$('[data-match-status]').textContent=rows.length?`找到 ${rows.length} 位同名客户，请明确选择；不会自动合并。`:'未找到完全同名客户，保存时将创建新档案。';}
   matches(data.clients);
   form.elements.clientName.oninput=()=>{matchedName=null;lookupVersion++;form.elements.clientId.innerHTML='<option value="">请先按姓名查找</option>';form.elements.clientId.required=true;};
   $('[data-match]').onclick=async()=>{const name=form.elements.clientName.value.trim(),lookup=++lookupVersion;try{const result=await intakeRpc(supabase,'sculpy_intake_lookup',{p_name:name});if(destroyed||mine!==version||lookup!==lookupVersion||form.elements.clientName.value.trim()!==name)return;matches(result.clients);matchedName=name;status('客户查找完成。');}catch(e){status(e.message)}};
   form.oninput=()=>{form.elements.confirmed.checked=false;};
   form.elements.confirmed.oninput=e=>e.stopPropagation();
   $('[data-new]').onclick=()=>{source.disabled=false;source.value='';recordedAt=null;invalidate();$('[data-identify]').disabled=false;$('[data-manual]').disabled=false;status('可以录入下一单。');};
   form.onsubmit=async e=>{
    e.preventDefault();if(saving||destroyed)return;
    if(matchedName===null||matchedName.trim()!==form.elements.clientName.value.trim()){status('姓名已变化，请先按姓名查找已有客户。');return;}
    const payload=Object.fromEntries([...fields.map(f=>f[0]),'clientId','serviceId','artistId'].map(k=>[k,form.elements[k].value.trim()]));
    // Freeze the exact request after sending; retry a lost response with the same key/body.
    pending??={p_request_id:requestId,p_payload:payload,p_raw_text:source.value,p_recorded_at:recordedAt};
    saving=true;source.disabled=true;$('[data-identify]').disabled=true;$('[data-manual]').disabled=true;
    form.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=true);status('正在保存到云端…');
    try{
     const result=await intakeRpc(supabase,'sculpy_confirm_intake',pending);
     if(destroyed||mine!==version)return;
     status('已保存到云端。正在重新读取订单…');
     $('[data-new]').hidden=false;$('[data-new]').disabled=false;
     try{await onSaved(result.bookingId);status('已保存并重新读取云端订单。其他设备登录后可查询。');}catch{status('订单已保存，但重新读取失败。请刷新查询，勿重复建单。');}
    }catch(error){
     if(destroyed||mine!==version)return;
     status(error.message+' 若网络中断，请点击重试；尚未收到成功确认。');
     const submit=form.querySelector('[type=submit]');submit.disabled=false;submit.textContent='重试同一笔保存';
     // Database validation failures are definitive. Allow corrections with a fresh key.
     if(/^(22|23|42|P0)/.test(error.code||'') || /同名|重复|年份|日期|时间|预算|客户资料|字段|服务类型|化妆师|原文|请求已使用/.test(error.message)){
      pending=null;requestId=crypto.randomUUID();source.disabled=false;$('[data-identify]').disabled=false;$('[data-manual]').disabled=false;
      form.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=false);form.elements.confirmed.checked=false;submit.textContent='确认保存到云端';
     }
    }finally{saving=false;}
   };
   status('请核对并补齐标注的字段，确认前不会写入。');
  }catch(e){status(e.message)}
 }
 $('[data-manual]').onclick=()=>{if(!source.value.trim())return status('请先填写客户原话。');recordedAt??=new Date().toISOString();void review();};
 $('[data-identify]').onclick=async()=>{
  if(!config.cloudIntakeAiEnabled)return;
  if(!source.value.trim())return status('请先填写客户原话。');
  invalidate();recordedAt??=new Date().toISOString();const mine=version,button=$('[data-identify]');button.disabled=true;status('正在识别，尚未保存…');
  try{const result=await identifyCloudIntake(supabase,source.value);if(destroyed||mine!==version)return;if(!result.isNewBooking){status(result.warnings.join('；')||'未识别到明确的新订单需求，请核对或手动填写。');return;}await review(result.draft,result.warnings);}
  catch(e){if(!destroyed&&mine===version)status(e.message)}finally{if(!destroyed&&!saving)button.disabled=false;}
 };
 return {destroy(){destroyed=true;version++;root.replaceChildren();}};
}
