const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaultHeading='业务工作台';

export function mountWelcomeEditor({root,supabase,profile,onCurrentChange}){
 let alive=true,accounts=[],pending=null,busy=false,readVersion=0;
 const drafts=new Map();
 root.innerHTML=`<div class="welcome-editor-heading"><div><h3>编辑欢迎语</h3><p>为每个账户设置登录后的欢迎文字。</p></div></div><form><label>选择账户<select name="account" aria-label="欢迎语所属账户" disabled></select></label><label>欢迎语<textarea name="welcome" aria-label="欢迎语" maxlength="160" rows="3" placeholder="留空使用默认欢迎语" disabled></textarea></label><div class="welcome-preview"><span>显示预览</span><p data-preview>${defaultHeading}</p></div><div class="welcome-editor-actions"><button type="submit" class="auth-primary" disabled>保存欢迎语</button><button type="button" class="auth-secondary" data-cancel disabled>取消修改</button><button type="button" class="auth-secondary" data-reload>读取最新内容</button><small data-count>0 / 160</small></div><p class="cloud-note">最多 160 字；留空保存后显示“业务工作台”。其他设备刷新页面或重新登录后生效。</p><p role="status" aria-live="polite" data-status></p></form>`;
 const $=s=>root.querySelector(s),form=$('form'),select=form.elements.account,input=form.elements.welcome;
 const selected=()=>accounts.find(a=>a.id===select.value);
 const canLeave=()=>!busy&&!pending&&drafts.size===0;
 const beforeUnload=e=>{if(!canLeave()){e.preventDefault();e.returnValue='';}};
 window.addEventListener('beforeunload',beforeUnload);
 function controls(){
  select.disabled=busy||!!pending||!accounts.length;input.disabled=select.disabled;
  $('button[type=submit]').disabled=busy||!accounts.length;
  $('[data-cancel]').disabled=busy||!!pending||!drafts.has(select.value);
  $('[data-reload]').disabled=busy||!!pending;
  $('button[type=submit]').textContent=pending?'重试保存':'保存欢迎语';
 }
 function preview(){
  $('[data-preview]').textContent=input.value.trim()||defaultHeading;
  $('[data-count]').textContent=`${input.value.length} / 160`;
 }
 function render(){const a=selected();input.value=drafts.get(a?.id)??a?.welcome_message??'';preview();controls();}
 async function load({discard=false}={}){
  if(busy||pending)return;
  const version=++readVersion;busy=true;controls();$('[data-status]').textContent='正在读取欢迎语…';
  try{
   const {data,error}=await supabase.rpc('list_account_welcomes');
   if(error||!Array.isArray(data))throw error||Error('Invalid response');
   if(!alive||version!==readVersion)return;
   const id=select.value||profile.id;accounts=data;
   if(discard)drafts.delete(id);
   select.innerHTML=accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.display_name)} · ${esc(a.username||'未绑定账号')}</option>`).join('');
   if(accounts.some(a=>a.id===id))select.value=id;
   render();$('[data-status]').textContent=accounts.length?'':'暂无账户。';
  }catch{if(alive)$('[data-status]').textContent='读取失败，请重试；当前草稿已保留。';}
  finally{if(alive){busy=false;controls();}}
 }
 select.onchange=()=>{render();$('[data-status]').textContent='';};
 input.oninput=()=>{const a=selected();if(input.value!==(a?.welcome_message??''))drafts.set(a.id,input.value);else drafts.delete(a.id);preview();controls();$('[data-status]').textContent='尚未保存';};
 $('[data-cancel]').onclick=()=>{drafts.delete(select.value);render();$('[data-status]').textContent='已取消本次修改。';};
 $('[data-reload]').onclick=()=>void load({discard:true});
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||!selected())return;
  pending??={p_id:select.value,p_message:input.value.trim(),p_revision:selected().welcome_revision};
  busy=true;controls();$('[data-status]').textContent='正在保存…';
  try{
   const {data,error}=await supabase.rpc('set_account_welcome',pending);
   if(error){
    if(['40001','42501','22023','P0002'].includes(error.code)){
     pending=null;
     $('[data-status]').textContent=error.code==='40001'?'其他设备已修改这句欢迎语。草稿已保留，请复制后读取最新内容再核对保存。':'保存失败，请检查权限或内容后重试。';
    }else $('[data-status]').textContent='尚未收到保存确认，请重试同一笔保存。';
    return;
   }
   if(!data||data.id!==pending.p_id||typeof data.welcome_message!=='string'||data.welcome_revision==null)throw Error('Invalid save response');
   if(!alive)return;
   const savedId=pending.p_id;Object.assign(selected(),data);drafts.delete(savedId);pending=null;
   if(savedId===profile.id)onCurrentChange(data.welcome_message);
   render();
   const read=await supabase.rpc('list_account_welcomes');
   if(!alive)return;
   const saved=read.data?.find(a=>a.id===savedId);
   if(read.error||!saved){$('[data-status]').textContent='已保存；重新读取暂时失败，可稍后读取最新内容。';return;}
   accounts=read.data;render();
   if(savedId===profile.id)onCurrentChange(saved.welcome_message);
   $('[data-status]').textContent=saved.welcome_message===data.welcome_message?'已保存到云端，其他设备刷新后生效。':'已保存；其他设备随后更新了内容，现显示最新欢迎语。';
  }catch{if(alive)$('[data-status]').textContent=pending?'尚未收到保存确认，请重试同一笔保存。':'已保存；重新读取暂时失败，可稍后读取最新内容。';}
  finally{if(alive){busy=false;controls();}}
 };
 void load();
 return {canLeave,destroy(){alive=false;readVersion++;window.removeEventListener('beforeunload',beforeUnload);}};
}
