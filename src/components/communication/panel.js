import {communicationContext,communicationCommand,communicationAI,prepareCommunicationFile,prepareCommunicationRecord,saveCommunicationRecord,communicationFile,summaryFields} from '../../services/communications.js?v=24';
import {cloudWriteFailure} from '../../services/cloud-intake.js?v=cloud-write-20261022';
import {createVoiceCapture} from '../../pages/sculpy/voice.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'America/Toronto',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function mountCommunicationPanel({root,supabase,type,id,onChange=()=>{}}){
 let alive=true,busy=false,working=false,pending=null,summaryPending=null,draft=null,files=[],records=[],data=null,userId=null,voiceUsed=false,recording=false;
 let loading=false,dragDepth=0;
 const urls=new Set();
 root.className='communication-panel';
 root.innerHTML=`<header class="comm-header"><div><h4>沟通记录</h4><p>记录原话，保留完整上下文。</p></div><span data-pending class="comm-badge">读取中</span></header><div class="comm-layout"><div class="comm-original"><form data-compose><div class="comm-dropzone" role="group" aria-label="截图添加区域"><label class="sr-only" for="comm-${esc(id)}">客户沟通内容</label><textarea id="comm-${esc(id)}" data-text rows="4" aria-describedby="comm-drop-hint-${esc(id)}" placeholder="记录客户原话、需求变化或待办事项…"></textarea><p class="comm-drop-hint" id="comm-drop-hint-${esc(id)}" data-drop-hint>截图可直接拖入此处 · 支持多张</p><div data-files class="comm-files"></div></div><div class="comm-compose-actions"><button type="button" data-voice>语音</button><label class="comm-file-button">＋ 截图 / 录音<input type="file" data-upload accept="image/png,image/jpeg,image/webp,audio/*" multiple></label><button type="submit" class="auth-primary" data-save>保存记录</button></div><p data-voice-status role="status"></p></form><p data-status role="status" aria-live="polite"></p><div class="comm-toolbar"><h5>原始记录</h5><button type="button" data-refresh>刷新</button><label><input type="checkbox" data-only-pending>只看待整理</label></div><button type="button" data-older hidden>查看更早记录</button><div data-timeline></div></div><aside class="comm-review"><div class="comm-toolbar"><h5>整理与归档</h5><span data-selection></span></div><p class="cloud-note">勾选原文后整理。截图与语音会发送给现有AI服务；审核确认后才归档。</p><button type="button" data-ai>AI 整理所选记录</button><p data-ai-status role="status"></p><div data-draft></div><div data-summaries></div></aside></div>`;
 const $=s=>root.querySelector(s),status=t=>{if(alive)$('[data-status]').textContent=t;};
 const dirty=()=>!!$('[data-text]')?.value.trim()||files.length>0||draft!==null||recording;
 const canLeave=()=>!busy&&!working&&!pending&&!summaryPending&&!dirty();
 const canAddFiles=()=>alive&&!busy&&!working&&!pending&&!recording;
 function dragFeedback(active){root.classList.toggle('is-file-dragging',active);if(alive)$('[data-drop-hint]').textContent=active?'松开即可添加截图':'截图可直接拖入此处 · 支持多张';}
 const voice=createVoiceCapture({$:s=>s==='#voice-button'?$('[data-voice]'):s==='#voice-status'?$('[data-voice-status]'):s==='#sculpy-text'?$('[data-text]'):null,config:{aiMode:'openai'},transcribeAudio:async blob=>{
  working=true;recording=false;lock();
  try{const f=await prepareCommunicationFile(new File([blob],'沟通录音',{type:blob.type}));f.file=new File([f.file],`沟通录音.${f.extension}`,{type:f.file.type});files.push(f);voiceUsed=true;renderFiles();const form=new FormData();form.append('audio',f.file,f.file.name);return await communicationAI(supabase,'voice',form);}
  finally{working=false;lock();}
 }});
 function lock(){if(!alive)return;const frozen=busy||!!pending;root.querySelectorAll('[data-compose] textarea,[data-compose] input,[data-compose] button').forEach(x=>x.disabled=frozen||working);$('[data-upload]').disabled=!canAddFiles();$('[data-save]').disabled=busy||working||recording;$('[data-ai]').disabled=busy||working||!!pending||!!draft;$('[data-refresh]').disabled=!canLeave();$('[data-older]').disabled=busy||working;$('.comm-dropzone').setAttribute('aria-disabled',String(!canAddFiles()));if(!canAddFiles()){dragDepth=0;dragFeedback(false);}}
 function renderFiles(){if(!alive)return;$('[data-files]').innerHTML=files.map((a,i)=>`<span>${esc(a.file.name)} <button type="button" data-remove="${i}" aria-label="移除${esc(a.file.name)}">×</button></span>`).join('');root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(busy||pending||working)return;files.splice(Number(b.dataset.remove),1);renderFiles();lock();});}
 function selected(){return [...root.querySelectorAll('[data-select]:checked')].map(x=>x.value);}
 function selection(){if(alive)$('[data-selection]').textContent=`已选 ${selected().length} 条`;}
 function renderTimeline(){
  const checked=new Set(selected()),known=new Set([...root.querySelectorAll('[data-select]')].map(x=>x.value));
  $('[data-timeline]').innerHTML=records.filter(r=>!$('[data-only-pending]').checked||!r.reviewed).map(r=>`<article class="comm-record"><header><label><input type="checkbox" data-select value="${esc(r.id)}" ${(checked.has(r.id)||(!known.has(r.id)&&!r.reviewed))?'checked':''}>${esc(r.author)} · ${esc(time(r.created_at))}</label><small>${r.reviewed?'已归档':'待整理'} · ${esc(r.id.slice(0,8))}</small></header><p class="comm-raw">${esc(r.raw_text)}</p><div class="comm-attachments">${(r.attachments||[]).map(a=>`<button type="button" data-file="${esc(a.object_path)}">${a.mime_type.startsWith('image/')?'▧':'♪'} ${esc(a.name)}</button>`).join('')}</div><div data-preview="${esc(r.id)}"></div></article>`).join('')||'<p class="cloud-note">还没有记录。保存后可在其他设备查看。</p>';
  root.querySelectorAll('[data-select]').forEach(x=>x.onchange=selection);
  root.querySelectorAll('[data-file]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const blob=await communicationFile(supabase,b.dataset.file);if(!alive)return;const url=URL.createObjectURL(blob);urls.add(url);const host=b.closest('article').querySelector('[data-preview]');const a=records.flatMap(r=>r.attachments||[]).find(a=>a.object_path===b.dataset.file);const el=document.createElement(a.mime_type.startsWith('image/')?'img':'audio');if(el.tagName==='IMG')el.alt=a.name;else el.controls=true;el.src=url;host.replaceChildren(el);}catch(e){status('附件读取失败：'+e.message);}finally{if(alive)b.disabled=false;}});
  selection();
 }
 function renderSummaries(){const host=$('[data-summaries]');host.innerHTML=(data?.summaries||[]).map(s=>`<details class="comm-summary" open><summary>已确认摘要 · ${esc(time(s.confirmed_at))}</summary><small>${esc(s.author)} · ${s.source_ids.length} 条原文</small>${Object.entries(summaryFields).map(([k,title])=>`<h6>${title}</h6><ul>${(s.content[k]||[]).map(x=>`<li>${esc(x)}</li>`).join('')||'<li>暂无</li>'}</ul>`).join('')}</details>`).join('');}
 async function load(older=false){if(!alive||loading)return;if(!older&&!canLeave())return status('输入或摘要尚未保存，请先保存或清空。');loading=true;try{
  const before=older?records[0]:null;const d=await communicationContext(supabase,type,id,before);if(!alive)return;
  data=d;records=older?[...d.records,...records.filter(r=>!d.records.some(x=>x.id===r.id))]:d.records;
  $('[data-pending]').textContent=`${d.pending} 条待整理`;$('[data-older]').hidden=records.length>=d.total;
  renderTimeline();renderSummaries();status(`云端共 ${d.total} 条记录 · 显示 ${records.length} 条`);
 }catch(e){status('读取失败：'+e.message);}finally{loading=false;lock();}}
 $('[data-text]').oninput=lock;
 async function addFiles(incoming){
  if(!canAddFiles())return;
  const batch=Array.from(incoming);if(!batch.length)return status('没有可添加的文件，请直接拖入截图文件。');
  working=true;lock();let added=0,rejected=0;const issues=new Set();
  try{for(let i=0;i<batch.length;i++){
   if(files.length>=20){rejected+=batch.length-i;issues.add('每次最多20个附件，请先保存这一批。');break;}
   try{const item=await prepareCommunicationFile(batch[i]);if(!alive)return;files.push(item);added++;}
   catch(error){rejected++;issues.add(error.message);}
  }
  if(!alive)return;renderFiles();status([added?`已添加 ${added} 个附件，点击保存后上传至云端。`:'',rejected?`${rejected} 个附件未添加：${[...issues].join(' ')}`:''].filter(Boolean).join(' '));
  }finally{working=false;lock();}
 }
 $('[data-upload]').onchange=e=>{const batch=Array.from(e.target.files);e.target.value='';void addFiles(batch);};
 const fileDrag=e=>[...(e.dataTransfer?.types||[])].includes('Files')||e.dataTransfer?.files?.length>0;
 root.ondragenter=e=>{if(!fileDrag(e))return;e.preventDefault();dragDepth++;dragFeedback(canAddFiles());};
 root.ondragover=e=>{if(!fileDrag(e))return;e.preventDefault();e.dataTransfer.dropEffect=canAddFiles()?'copy':'none';dragFeedback(canAddFiles());};
 root.ondragleave=()=>{if(dragDepth>0&&--dragDepth===0)dragFeedback(false);};
 root.ondragend=()=>{dragDepth=0;dragFeedback(false);};
 root.ondrop=e=>{if(!fileDrag(e))return;e.preventDefault();e.stopPropagation();dragDepth=0;dragFeedback(false);
  if(!canAddFiles())return status(pending?'请先重试保存当前记录，再添加附件。':recording?'请先结束录音，再添加附件。':'正在处理，请稍后再添加附件。');
  // Copy before awaiting: browsers expose the drag data store only during this event.
  void addFiles(Array.from(e.dataTransfer.files));
 };
 $('[data-voice]').onclick=async()=>{if(busy||pending||working)return;recording=!recording;lock();await voice.toggle();if(!String($('[data-voice-status]')?.textContent).includes('正在聆听'))recording=false;lock();};
 $('[data-compose]').onsubmit=async e=>{e.preventDefault();if(busy||working||recording)return;
  busy=true;lock();
  try{if(!pending){if(!$('[data-text]').value.trim()&&!files.length)return status('先写点内容或添加截图。');const {data,error}=await supabase.auth.getUser();if(error||!data?.user)throw Error('请重新登录。');userId=data.user.id;pending=prepareCommunicationRecord({type,id,text:$('[data-text]').value,files:[...files],userId,kind:files.length?'mixed':voiceUsed?'voice':'text'});}
   busy=true;lock();status('正在上传并保存…');await saveCommunicationRecord(supabase,pending);
   pending=null;files=[];voiceUsed=false;if(!alive)return;$('[data-text]').value='';renderFiles();busy=false;lock();status('已保存到云端。');await load();onChange();
  }catch(error){if(!alive)return;if(pending&&cloudWriteFailure(error)!=='uncertain')pending=null;status((pending?'尚未收到保存确认，请重试同一笔记录。 ':'保存失败，内容仍保留。 ')+error.message);}
  finally{busy=false;lock();if(alive)$('[data-save]').textContent=pending?'重试保存':'保存记录';}
 };
 function renderDraft(){
  $('[data-draft]').innerHTML=`<form data-review-form><h5>审核摘要</h5><p class="cloud-note">覆盖 ${draft.sourceIds.length} 条选中记录。可对照原始记录逐项修改，确认后归档。</p>${Object.entries(summaryFields).map(([k,title])=>`<label>${title}<textarea name="${k}" rows="3">${esc((draft.content[k]||[]).join('\n'))}</textarea></label>`).join('')}<label class="comm-confirm"><input name="approved" type="checkbox" required>我已核对来源并确认摘要</label><div class="comm-compose-actions"><button class="auth-primary" type="submit">确认归档</button><button type="button" data-discard>放弃摘要</button></div></form>`;
  const form=$('[data-review-form]');form.oninput=e=>{if(e.target.name!=='approved')form.elements.approved.checked=false;};
  $('[data-discard]').onclick=()=>{if(busy||summaryPending)return;draft=null;$('[data-draft]').replaceChildren();lock();};
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;
   if(!summaryPending)summaryPending={p_request_id:crypto.randomUUID(),p_action:'confirm_summary',p_payload:{type,id,sourceIds:draft.sourceIds,content:Object.fromEntries(Object.keys(summaryFields).map(k=>[k,form.elements[k].value.split('\n').map(x=>x.trim()).filter(Boolean)])),confirmed:true}};
   busy=true;lock();form.querySelectorAll('input,textarea,button').forEach(x=>x.disabled=true);$('[data-ai-status]').textContent='正在保存审核结果…';
   try{await communicationCommand(supabase,summaryPending);summaryPending=null;draft=null;if(!alive)return;$('[data-draft]').replaceChildren();$('[data-ai-status]').textContent='已确认归档；原文完整保留。';busy=false;lock();await load();onChange();}
   catch(error){if(!alive)return;const failure=cloudWriteFailure(error);if(failure!=='uncertain'){summaryPending=null;form.querySelectorAll('input,textarea,button').forEach(x=>x.disabled=false);form.elements.approved.checked=false;}const submit=form.querySelector('[type=submit]');submit.disabled=false;submit.textContent=summaryPending?'重试同一笔归档':'确认归档';$('[data-ai-status]').textContent=error.message+' 摘要仍保留。';}
   finally{busy=false;lock();}
  };
 }
 $('[data-ai]').onclick=async()=>{if(busy||working||draft)return;const sourceIds=selected();if(!sourceIds.length)return status('请先勾选要整理的原始记录。');busy=true;lock();$('[data-ai-status]').textContent='正在读取所选原文、截图和语音…';try{const result=await communicationAI(supabase,'summary',{type,id,sourceIds});if(!alive)return;draft=result;renderDraft();$('[data-ai-status]').textContent='摘要待审核，尚未归档。';}catch(e){if(alive)$('[data-ai-status]').textContent=e.message;}finally{busy=false;lock();}};
 $('[data-refresh]').onclick=()=>void load();$('[data-older]').onclick=()=>void load(true);$('[data-only-pending]').onchange=renderTimeline;
 void load();
 return {canLeave,refresh:load,destroy(){alive=false;root.ondragenter=root.ondragover=root.ondragleave=root.ondragend=root.ondrop=null;root.classList.remove('is-file-dragging');voice.dispose();urls.forEach(x=>URL.revokeObjectURL(x));root.replaceChildren();}};
}
