import {esc} from './wedding-dashboard.js';

const fields=[['display_name','客户姓名',160],['preferred_name','称呼',160],['phone','电话',100],['email','邮箱',254],['wechat','微信',160],['instagram','Instagram',160],['referral_source','客户来源',100],['city','城市',100],['preferred_language','语言',40],['wedding_date','婚礼日期',10],['tags','标签（用分号分隔）',1100],['internal_notes','内部备注',8000]];
export function mountClientEditor({root,supabase,detail,onSaved}){
 let alive=true,dirty=false,saving=false,reading=false,version=0,prepared=null,pending=null;
 const original={...detail.client,...detail.contact,tags:detail.client.tags||[]};
 root.innerHTML=`<button type="button" data-client-edit>编辑客户资料</button><section class="os-card" data-client-edit-panel hidden><h4>编辑客户资料</h4><form data-client-edit-form>
 <div class="os-client-fields">${fields.map(([key,label,max])=>`<label>${esc(label)}${key==='internal_notes'?`<textarea name="${key}" maxlength="${max}" rows="4"></textarea>`:`<input name="${key}" type="${key==='wedding_date'?'date':'text'}" maxlength="${max}" ${key==='display_name'?'required':''}>`}</label>`).join('')}</div>
 <div class="os-shortcuts"><button type="button" data-client-review>核对修改</button><button type="button" data-client-discard>放弃未保存修改</button></div>
 <section data-client-review-panel hidden><h4>本次修改</h4><div data-client-diff></div><p data-client-duplicates></p><label><input type="checkbox" name="confirmed">已核对修改和可能重复的客户</label><button type="submit">确认保存客户资料</button><button type="button" data-client-back>返回编辑</button></section>
 <p role="status" data-client-edit-status></p><button type="button" data-client-reload hidden>放弃草稿并重新读取</button></form></section>`;
 const $=s=>root.querySelector(s),form=$('[data-client-edit-form]'),status=$('[data-client-edit-status]'),submit=form.querySelector('[type=submit]');
 const fill=()=>{for(const [key] of fields)form.elements[key].value=key==='tags'?(original.tags||[]).join(';'):original[key]||'';form.elements.confirmed.checked=false;};
 function lock(value){for(const el of form.elements)if(el!==submit)el.disabled=value;$('[data-client-edit]').disabled=value;}
 function resetReview(){prepared=null;$('[data-client-review-panel]').hidden=true;form.elements.confirmed.checked=false;}
 $('[data-client-edit]').onclick=()=>{if(pending||saving||!$('[data-client-edit-panel]').hidden)return;fill();dirty=false;resetReview();status.textContent='';$('[data-client-edit-panel]').hidden=false;};
 $('[data-client-discard]').onclick=()=>{if(pending||saving)return;version++;dirty=false;resetReview();fill();$('[data-client-edit-panel]').hidden=true;};
 form.oninput=event=>{if(event.target.name==='confirmed'||pending||saving)return;dirty=true;version++;resetReview();status.textContent='修改尚未保存，请先核对。';};
 $('[data-client-back]').onclick=()=>{if(!pending&&!saving){lock(false);resetReview();}};
 $('[data-client-reload]').onclick=async()=>{if(pending||saving)return;dirty=false;await onSaved();};
 $('[data-client-review]').onclick=async()=>{
  if(pending||saving||reading||!form.reportValidity())return;
  const mine=++version,values={};for(const [key] of fields)values[key]=key==='tags'?form.elements[key].value.split(';').map(x=>x.trim()).filter(Boolean):form.elements[key].value;
  reading=true;$('[data-client-review]').disabled=true;status.textContent='正在核对修改…';
  try{
   const {data,error}=await supabase.rpc('sculpy_os_client_review',{p_client_id:detail.client.id,p_expected_revision:detail.revision,p_fields:values});
   if(!alive||mine!==version)return;
   if(error){if(error.code==='40001'){$('[data-client-reload]').hidden=false;throw Error('客户资料已被更新。当前草稿保留，请重新读取后核对。');}throw Error('暂时无法核对，请检查填写内容后重试。');}
   if(!data?.fields||data.revision!==detail.revision||!Array.isArray(data.possibleDuplicates))throw Error('暂时无法核对，请重试。');
   const changes=fields.filter(([key])=>JSON.stringify(key==='tags'?original.tags:original[key]||null)!==JSON.stringify(data.fields[key]));
   if(!changes.length){dirty=false;status.textContent='没有需要保存的修改。';return;}
   prepared=data;lock(true);$('[data-client-back]').disabled=false;form.elements.confirmed.disabled=false;
   $('[data-client-diff]').innerHTML=changes.map(([key,label])=>`<p class="os-preserve-lines"><strong>${esc(label)}</strong><br>原值：${esc(Array.isArray(original[key])?original[key].join(';'):original[key]||'未填写')}<br>新值：${esc(Array.isArray(data.fields[key])?data.fields[key].join(';'):data.fields[key]||'未填写')}</p>`).join('');
   $('[data-client-duplicates]').textContent=data.possibleDuplicates.length?'发现可能重复客户：'+data.possibleDuplicates.map(x=>x.name).join('、')+'。请确认身份；系统不会自动合并。':'未发现同名或相同联系方式的其他客户。';
   $('[data-client-review-panel]').hidden=false;status.textContent='请核对后确认保存。';
  }catch(e){if(alive&&mine===version)status.textContent=e.message;}
  finally{reading=false;if(alive&&!prepared)$('[data-client-review]').disabled=false;}
 };
 form.onsubmit=async event=>{
  event.preventDefault();if(!alive||saving||!prepared||!form.elements.confirmed.checked)return;
  if(!pending)pending={p_request_id:crypto.randomUUID(),p_client_id:detail.client.id,p_expected_revision:prepared.revision,p_fields:prepared.fields,p_confirmed:true};
  saving=true;lock(true);submit.disabled=true;status.textContent='正在保存…';let saved=false;
  try{
   const {data,error}=await supabase.rpc('sculpy_os_update_client',pending);if(!alive)return;
   if(error){
    if(['22023','42501','40001','23505','PGRST202','42883'].includes(error.code)){
     pending=null;lock(false);resetReview();
     status.textContent=error.code==='40001'?'客户资料已被更新。当前草稿保留，请重新读取后核对。':error.code==='42501'?'权限已变化，请重新登录后核对。':'修改未保存，请重新核对填写内容。';
     if(error.code==='40001')$('[data-client-reload]').hidden=false;return;
    }throw Error('unknown');
   }
   if(data?.id!==pending.p_client_id||data?.requestId!==pending.p_request_id)throw Error('unknown');
   pending=null;dirty=false;saved=true;status.textContent='客户资料已保存。';
  }catch{if(alive){status.textContent='未收到保存确认，请重试同一笔修改。';submit.textContent='重试同一笔修改';}}
  finally{saving=false;if(alive)submit.disabled=false;}
  if(saved)try{await onSaved();}catch{if(alive)status.textContent='客户资料已保存，刷新失败，请重新读取；无需重复保存。';}
 };
 return {canLeave:()=>!dirty&&!pending&&!saving,destroy(){alive=false;version++;}};
}
