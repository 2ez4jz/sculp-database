import {esc} from './wedding-dashboard.js';
import {importFields,csvTemplate,parseCsv,mapImportRows} from './os-import-csv.js?v=os32-20261116';

export function mountHistoryImport({root,supabase,onSaved,onClient,onOrder}){
 let alive=true,csv=null,plan=null,currentRows=[],pending=null,saving=false,reading=false,version=0,done=new Set(),excluded=new Set(),choices=new Map();
 root.innerHTML=`<details data-import-panel><summary>导入历史客户与订单</summary><p>先导入客户，再关联订单。每批最多 100 行，预览核对后才保存。</p>
 <div class="os-import-controls"><label>导入内容<select data-import-kind><option value="clients">客户资料</option><option value="orders">订单资料</option></select></label><button type="button" data-import-template>下载 CSV 模板</button><label>选择 UTF-8 CSV（最多 2 MiB／2000 行）<input data-import-file type="file" accept=".csv,text/csv"></label></div>
 <p class="cloud-note">日期填写 YYYY-MM-DD，时间填写 HH:MM（多伦多）；夏令时重复时段须填写 utc_offset。完整时间可用 2027-06-21T10:00:00-04:00。状态填写 inquiry / confirmed / completed / cancelled，币种如 CAD；未知价格留空。定金和实际收退款不在本次导入范围。</p>
 <p data-import-services class="cloud-note"></p><p role="status" data-import-status>尚未选择文件。</p>
 <section data-import-mapping hidden><h4>字段映射</h4><div class="os-client-fields" data-import-fields></div><label>当前批次<select data-import-batch></select></label><button type="button" data-import-preview>生成／刷新预览</button><button type="button" data-import-reset>清空本次导入</button></section>
 <section data-import-review hidden><h4>核对导入内容</h4><p data-import-summary></p><p class="cloud-note">有错误的行可以取消勾选，再刷新预览；需要匹配的客户请明确选择。关联已有记录会保留原资料。</p><div data-import-rows></div><label><input type="checkbox" data-import-confirmed>已逐项核对当前批次，确认新增／关联／跳过的记录</label><button type="button" data-import-save>确认导入当前批次</button></section>
 <section data-import-result hidden><h4>批次保存结果</h4><div data-import-result-rows></div></section></details>`;
 const $=s=>root.querySelector(s),status=$('[data-import-status]'),kind=()=>$('[data-import-kind]').value;
 const canLeave=()=>!saving&&!pending;
 const clearPlan=()=>{version++;plan=null;$('[data-import-review]').hidden=true;$('[data-import-confirmed]').checked=false;};
 function lock(locked){for(const el of root.querySelectorAll('input,select,button'))if(el!==$('[data-import-save]'))el.disabled=locked;}
 function reset(){if(!canLeave())return;clearPlan();csv=null;currentRows=[];done=new Set();excluded=new Set();choices=new Map();$('[data-import-mapping]').hidden=true;$('[data-import-result]').hidden=true;$('[data-import-file]').value='';status.textContent='尚未选择文件。';}
 $('[data-import-kind]').onchange=reset;$('[data-import-reset]').onclick=reset;
 $('[data-import-template]').onclick=()=>{
  const blob=new Blob([csvTemplate(kind())],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`sculp-${kind()}-template.csv`;a.click();URL.revokeObjectURL(url);
 };
 $('[data-import-file]').onchange=async()=>{
  if(!canLeave())return;clearPlan();csv=null;done=new Set();excluded=new Set();choices=new Map();$('[data-import-result]').hidden=true;$('[data-import-mapping]').hidden=true;
  const file=$('[data-import-file]').files[0];if(!file)return;
  const mine=version;
  try{
   if(file.size>2097152)throw Error('文件超过 2 MiB，请先拆分。');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(!alive||mine!==version)return;
   csv=parseCsv(text);
   $('[data-import-fields]').innerHTML=importFields[kind()].map(([key,label])=>{
    const guessed=csv.headers.find(h=>h.toLowerCase()===key.toLowerCase()||h===label);
    return `<label>${esc(label)}<select data-import-field="${esc(key)}"><option value="">不导入此字段</option>${csv.headers.map(h=>`<option value="${esc(h)}" ${h===guessed?'selected':''}>${esc(h)}</option>`).join('')}</select></label>`;
   }).join('');
   $('[data-import-batch]').innerHTML=Array.from({length:Math.ceil(csv.rows.length/100)},(_,i)=>`<option value="${i}">第 ${i*100+1}–${Math.min((i+1)*100,csv.rows.length)} 条</option>`).join('');
   $('[data-import-mapping]').hidden=false;status.textContent=`已读取 ${file.name}，共 ${csv.rows.length} 条。请核对映射，再生成预览。`;
  }catch(e){status.textContent=e instanceof TypeError?'无法按 UTF-8 读取，请从表格重新导出 UTF-8 CSV。':e.message;}
 };
 $('[data-import-fields]').onchange=()=>{if(canLeave()){clearPlan();excluded=new Set();choices=new Map();done=new Set();status.textContent='映射已变化，请重新预览。';}};
 $('[data-import-batch]').onchange=()=>{if(canLeave()){clearPlan();excluded=new Set();choices=new Map();status.textContent='批次已切换，请重新预览。';}};
 $('[data-import-preview]').onclick=async()=>{
  if(!canLeave()||reading||!csv)return;clearPlan();const mine=version;reading=true;$('[data-import-preview]').disabled=true;status.textContent='正在核对导入内容…';
  const mapping=Object.fromEntries([...root.querySelectorAll('[data-import-field]')].map(el=>[el.dataset.importField,el.value]));
  const batch=Number($('[data-import-batch]').value);currentRows=mapImportRows(csv,kind(),mapping,batch*100,(batch+1)*100).filter(r=>!excluded.has(r.line)).map(r=>choices.has(r.line)?{...r,client_choice:choices.get(r.line)}:r);
  try{
   if(!currentRows.length)throw Error('当前批次没有选择任何行。');
   const {data,error}=await supabase.rpc('sculpy_os_import_preview',{p_kind:kind(),p_rows:currentRows});if(!alive||mine!==version)return;
   if(error||!Array.isArray(data?.rows)||!data.planHash)throw Error('预览暂不可用，请检查映射与数据后重试。');plan=data;$('[data-import-save]').textContent='确认导入当前批次';
   $('[data-import-summary]').textContent=`将新增 ${data.creates} 条、关联 ${data.links} 条、跳过 ${data.skips} 条；错误／待核对 ${data.errors} 条。`;
   $('[data-import-rows]').innerHTML=data.rows.map((r,i)=>`<article class="os-list-row"><label><input type="checkbox" data-import-include="${Number(r.line)}" checked>原文件第 ${Number(r.line)} 行 · ${esc({create:'新增',link:'关联已有',skip:'跳过',choose:'待选择客户',error:'需修正'}[r.action]||r.action)}</label><strong>${esc(currentRows[i]?.display_name||currentRows[i]?.client_name||'客户／订单')}</strong><p>${esc(r.reason)}</p>${r.clientName?`<span>关联客户：${esc(r.clientName)}</span>`:''}<details><summary>查看本行字段</summary><dl class="os-client-fields">${importFields[kind()].filter(([key])=>currentRows[i]?.[key]!==undefined&&key!=='client_choice').map(([key,label])=>`<div><dt>${esc(label)}</dt><dd>${esc(currentRows[i][key]||'未填写')}</dd></div>`).join('')}</dl></details>${r.action==='choose'?`<label>关联客户<select data-import-choice="${Number(r.line)}"><option value="">请选择</option>${kind()==='clients'?'<option value="new_confirmed">已核对，另建新客户</option>':''}${(r.candidates||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.email||c.phone||'联系方式未填写')}</option>`).join('')}</select></label>`:''}${r.normalized?.starts_at?`<span>服务时间：${esc(new Date(r.normalized.starts_at).toLocaleString('zh-CN',{timeZone:'America/Toronto'}))} · 多伦多</span><span>成交价：${r.normalized.price===null?'未知':esc(r.normalized.price)+' '+esc(r.normalized.currency)}</span>`:''}</article>`).join('');
   $('[data-import-review]').hidden=false;$('[data-import-save]').disabled=!data.ready||done.has(String(batch));status.textContent=data.ready?'预览完成，请确认当前批次。':'请修正／排除错误行，选择客户后刷新预览。';
  }catch(e){if(alive&&mine===version)status.textContent=e.message;}
  finally{reading=false;if(alive)$('[data-import-preview]').disabled=false;}
 };
 // Keep the review visible while a selection is being changed, but invalidate
 // the saved plan and require a fresh server preview before confirmation.
 $('[data-import-rows]').onchange=event=>{
  if(!canLeave())return;const el=event.target;
  if(el.dataset.importInclude){const line=Number(el.dataset.importInclude);el.checked?excluded.delete(line):excluded.add(line);}
  if(el.dataset.importChoice)choices.set(Number(el.dataset.importChoice),el.value);
  version++;plan=null;$('[data-import-confirmed]').checked=false;$('[data-import-save]').disabled=true;status.textContent='选择已变化，请刷新预览后确认。';
 };
 $('[data-import-save]').onclick=async()=>{
  if(!alive||saving||!plan||!$('[data-import-confirmed]').checked||!plan.ready)return;
  if(!pending)pending={p_request_id:crypto.randomUUID(),p_kind:kind(),p_rows:currentRows,p_plan_hash:plan.planHash,p_confirmed:true};
  saving=true;lock(true);$('[data-import-save]').disabled=true;status.textContent='正在保存当前批次…';let saved=null;
  try{
   const {data,error}=await supabase.rpc('sculpy_os_import_commit',pending);if(!alive)return;
   if(error){if(['22023','23505','40001','42501','PGRST202','42883'].includes(error.code)){pending=null;lock(false);clearPlan();status.textContent=error.code==='40001'?'预览对应的记录已变化，请重新生成预览并核对。':'当前批次未保存，请核对内容与权限后重新预览。';return;}throw Error('unknown');}
   if(data?.requestId!==pending.p_request_id||!Array.isArray(data.rows))throw Error('unknown');
   saved=data;pending=null;done.add($('[data-import-batch]').value);lock(false);$('[data-import-save]').disabled=true;$('[data-import-confirmed]').checked=false;
   status.textContent=`当前批次已保存：新增 ${data.creates}、关联 ${data.links}、跳过 ${data.skips}。可切换下一批继续。`;
   $('[data-import-result]').hidden=false;$('[data-import-result-rows]').innerHTML=data.rows.map(r=>`<div class="os-list-row"><span>原文件第 ${Number(r.line)} 行 · ${esc(r.reason)}</span>${r.id?`<button type="button" data-import-open="${esc(r.id)}" data-import-type="${esc(pending?.p_kind||kind())}">查看保存记录</button>`:''}</div>`).join('');
  }catch{if(alive){status.textContent='未收到批次保存确认，请重试同一批次。';$('[data-import-save]').textContent='重试同一批次';}}
  finally{saving=false;if(alive&&pending)$('[data-import-save]').disabled=false;}
  if(saved)try{await onSaved();}catch{if(alive)status.textContent+=' 刷新失败，请重新读取，无需再次导入。';}
 };
 root.addEventListener('click',event=>{const el=event.target.closest('[data-import-open]');if(el&&canLeave())(el.dataset.importType==='clients'?onClient:onOrder)?.(el.dataset.importOpen);});
 void (async()=>{try{const {data,error}=await supabase.rpc('sculpy_os_import_catalog',{});if(alive&&!error&&Array.isArray(data?.services))$('[data-import-services]').textContent='可用服务代码：'+data.services.map(s=>s.code+'（'+s.name+'）').join('、');}catch{/* retry remains available */}})();
 return {canLeave,destroy(){alive=false;version++;}};
}
