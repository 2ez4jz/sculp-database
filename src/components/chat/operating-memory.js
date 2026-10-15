const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createOperatingMemory(host,adapter){
 if(!adapter)return;
 const panel=document.createElement('details');panel.className='chat-preferences operating-memory';
 panel.innerHTML='<summary>经营记忆 · 管理员审核</summary><p>先提交待审内容，再核对并确认。讨论不会自动生效。更正确认后才替换旧版；可随时撤销。</p><input data-memory-search placeholder="检索记忆内容"><button type="button" data-memory-refresh>读取记忆</button><div data-memory-list></div><label>政策或更正内容<textarea data-memory-content maxlength="2000" rows="3"></textarea></label><span data-memory-correction></span><button type="button" data-memory-propose>提交待审</button><button type="button" data-memory-cancel>取消更正</button><p data-memory-status role="status"></p>';
 host.append(panel);let rows=[],supersedes=null,busy=false;
 const $=s=>panel.querySelector(s),status=t=>$('[data-memory-status]').textContent=t;
 const labels={pending:'待确认',active:'已确认',revoked:'已撤销',superseded:'已被更正'};
 function render(){const q=$('[data-memory-search]').value.trim().toLowerCase();$('[data-memory-list]').innerHTML=rows.filter(r=>r.content.toLowerCase().includes(q)).map(r=>`<section class="chat-proposal"><strong>${labels[r.status]} · v${r.revision}</strong><p>${esc(r.content)}</p><small>${esc(r.confirmed_at||r.created_at)}${r.supersedes_id?' · 更正旧记录':''}</small>${r.status==='pending'?`<button type="button" data-memory-confirm="${r.id}">确认生效</button>`:''}${r.status==='active'?`<button type="button" data-memory-correct="${r.id}">更正</button>`:''}${['active','pending'].includes(r.status)?`<button type="button" data-memory-revoke="${r.id}">撤销</button>`:''}</section>`).join('')||'<p>没有可显示的经营记忆。仅管理员可读取与审核。</p>';}
 async function load(){rows=await adapter.list();render();status('已读取最近100条记录；对话只检索最多20条已确认记忆。');}
 $('[data-memory-search]').oninput=render;
 panel.addEventListener('toggle',()=>{if(panel.open&&!busy)load().catch(e=>status(e.message));});
 panel.onclick=async e=>{const b=e.target.closest('button');if(!b||busy)return;
 if(b.hasAttribute('data-memory-cancel')){supersedes=null;$('[data-memory-correction]').textContent='';return;}
 if(b.dataset.memoryCorrect){supersedes=b.dataset.memoryCorrect;$('[data-memory-content]').value=rows.find(r=>r.id===supersedes).content;$('[data-memory-correction]').textContent='正在更正旧政策；提交后仍须再次确认。';return;}
 busy=true;b.disabled=true;try{
 if(b.hasAttribute('data-memory-refresh'))await load();
 else if(b.hasAttribute('data-memory-propose')){const content=$('[data-memory-content]').value.trim();if(!content)throw Error('请先填写内容。');await adapter.manage({action:'propose',id:crypto.randomUUID(),content,supersedes});supersedes=null;$('[data-memory-content]').value='';$('[data-memory-correction]').textContent='';await load();status('已提交待审，尚未生效。');}
 else {const id=b.dataset.memoryConfirm||b.dataset.memoryRevoke;if(id){const row=rows.find(r=>r.id===id);await adapter.manage({action:b.dataset.memoryConfirm?'confirm':'revoke',id,revision:row.revision});await load();status(b.dataset.memoryConfirm?'已人工确认，下次对话可检索使用。':'已撤销，下次对话不再作为有效政策。');}}
 }catch(error){status(error.message);}finally{busy=false;b.disabled=false;}};
}
