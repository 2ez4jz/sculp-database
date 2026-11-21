const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const scheduleCategories = {flight:'航班',hotel:'酒店',work:'工作',todo:'待办',personal:'个人安排'};
export const canManagePersonalSchedule = profile => profile?.active !== false &&
  (profile?.username === 'sculp_jz' && profile.role === 'operations' || profile?.username === 'sculp_miranda' && profile.role === 'owner');
const dateAt = (value, timezone) => new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const shiftDay = (day,n) => {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const scheduleOnDay = (item,day) => day >= (item.first_day || [item.starts_local.slice(0,10),item.ends_local?.slice(0,10)||item.starts_local.slice(0,10)].sort()[0]) && day <= (item.last_day || [item.starts_local.slice(0,10),item.ends_local?.slice(0,10)||item.starts_local.slice(0,10)].sort()[1]);
const localStamp = (stamp,timezone,allDay) => stamp ? `${stamp.slice(0,10)}${allDay?'':' '+stamp.slice(11,16)+' · '+timezone}` : '';
const zones = [['America/Toronto','多伦多'],['America/Vancouver','温哥华'],['Asia/Shanghai','中国'],['America/New_York','纽约 / 奥兰多'],['America/Los_Angeles','洛杉矶'],['Asia/Tokyo','东京'],['Asia/Hong_Kong','香港'],['Europe/London','伦敦'],['Europe/Paris','巴黎'],['UTC','UTC']];

export function mountPersonalSchedule({root,supabase,profile,now=()=>new Date()}) {
  if(!canManagePersonalSchedule(profile)){root.replaceChildren();return {canLeave:()=>true,refresh:async()=>{},destroy(){}};}
  const doc=root.ownerDocument,win=doc.defaultView;
  let alive=true,items=[],selected=dateAt(now(),'America/Toronto'),month=selected.slice(0,7),loading=0,busy=false,dirty=false,editing=null,pending=null,loadFailed=false;
  root.className='cloud-orders personal-schedule';root.dataset.osPersonal='';
  root.innerHTML=`<header class="ps-heading"><div><span class="auth-eyebrow">MIRANDA · PERSONAL PLANNER</span><h3>Miranda 行程</h3><p class="cloud-note">JZ 与 Miranda 共同查看、编辑。按行程当地日期显示。</p></div><button type="button" class="auth-primary" data-ps-new>新增行程 / 待办</button></header>
  <div class="ps-toolbar"><button type="button" data-ps-prev aria-label="上个月">上个月</button><label>月份<input type="month" data-ps-month min="2000-01" max="2100-12" value="${month}"></label><button type="button" data-ps-next aria-label="下个月">下个月</button><button type="button" data-ps-today>今天</button><button type="button" data-ps-refresh>刷新</button></div>
  <p role="status" aria-live="polite" data-ps-status></p><div class="ps-calendar" data-ps-calendar aria-label="Miranda 月历"></div>
  <section class="ps-day"><div class="ps-day-heading"><h4 data-ps-day-title></h4><label>筛选<select data-ps-filter><option value="">全部安排</option>${Object.entries(scheduleCategories).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label></div><div data-ps-items></div></section>
  <section class="ps-editor" data-ps-editor hidden><h4 data-ps-editor-title>新增安排</h4><form data-ps-form>
  <div class="ps-form-grid"><label>类型<select name="category">${Object.entries(scheduleCategories).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>标题<input name="title" required maxlength="200" placeholder="航班、酒店、工作或待办事项"></label>
  <label class="ps-check"><input name="all_day" type="checkbox">全天 / 时间待定</label><span></span>
  <label><span data-ps-start-label>开始日期</span><input name="start_date" type="date" required min="2000-01-01" max="2100-12-31"></label><label data-ps-time>开始时间（当地）<input name="start_time" type="time"></label>
  <label>开始时区<select name="start_timezone"></select></label><label>其他时区（可选，IANA 名称）<input name="start_custom_zone" maxlength="100" placeholder="例如 Asia/Bangkok"></label>
  <label><span data-ps-end-label>结束日期（可选）</span><input name="end_date" type="date" min="2000-01-01" max="2100-12-31"></label><label data-ps-time>结束时间（当地）<input name="end_time" type="time"></label>
  <label>结束时区<select name="end_timezone"></select></label><label>其他时区（可选，IANA 名称）<input name="end_custom_zone" maxlength="100" placeholder="例如 Asia/Bangkok"></label>
  <label><span data-ps-location-label>地点 / 地址</span><input name="location" maxlength="500"></label><label data-ps-flight>到达机场<input name="destination" maxlength="500"></label>
  <label data-ps-flight>航班号<input name="flight_number" maxlength="40" placeholder="例如 AC27"></label><label>预订 / 确认编号（可选）<input name="reference" maxlength="200"></label>
  </div><label>备注<textarea name="notes" maxlength="5000" rows="3" placeholder="航站楼、酒店地址、工作内容或需要准备的事项"></textarea></label>
  <label class="ps-check"><input name="completed" type="checkbox">已完成</label><p class="cloud-note">航班分别填写出发地与到达地当地时间；酒店填写入住与退房日期。工作安排仅记录在这里，不会创建客户订单。</p>
  <div class="ps-actions"><button type="submit" class="auth-primary" data-ps-save>保存安排</button><button type="button" data-ps-cancel>取消</button><button type="button" data-ps-delete hidden>删除安排</button></div><p role="status" aria-live="polite" data-ps-form-status></p></form></section>`;
  const $=s=>root.querySelector(s),form=$('[data-ps-form]'),f=form.elements;
  for(const field of ['start_timezone','end_timezone'])f[field].innerHTML=zones.map(([id,label])=>`<option value="${id}">${label} · ${id}</option>`).join('');
  const message=text=>{if(alive)$('[data-ps-status]').textContent=text;};
  function controls(){root.querySelectorAll('button').forEach(b=>b.disabled=busy);form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=busy);}
  function render(){
    const first=month+'-01',weekday=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,start=shiftDay(first,-weekday);
    $('[data-ps-calendar]').innerHTML=['一','二','三','四','五','六','日'].map(x=>`<span class="ps-weekday">${x}</span>`).join('')+Array.from({length:42},(_,i)=>{
      const day=shiftDay(start,i),list=items.filter(x=>scheduleOnDay(x,day)),open=list.filter(x=>!x.completed).length;
      return `<button type="button" data-ps-date="${day}" class="ps-date${day.slice(0,7)!==month?' ps-outside':''}${day===selected?' ps-selected':''}" aria-pressed="${day===selected}" aria-label="${day}，${list.length}项安排"><span>${Number(day.slice(8))}</span><small>${list.length?`${list.length} 项`:' '}</small>${open?'<i aria-label="有未完成安排"></i>':''}</button>`;
    }).join('');
    $('[data-ps-day-title]').textContent=selected+' · 当日安排';
    const list=items.filter(x=>scheduleOnDay(x,selected)&&(!$('[data-ps-filter]').value||x.category===$('[data-ps-filter]').value)).sort((a,b)=>Number(a.completed)-Number(b.completed)||a.starts_local.localeCompare(b.starts_local));
    $('[data-ps-items]').innerHTML=loadFailed?'<p class="cloud-note">行程读取失败，请点击刷新重试。</p>':list.length?list.map(item=>`<article class="ps-item${item.completed?' ps-completed':''}"><div class="ps-item-top"><label class="ps-check"><input type="checkbox" data-ps-done="${esc(item.id)}" aria-label="完成 ${esc(item.title)}" ${item.completed?'checked':''}><strong>${esc(item.title)}</strong></label><span class="ps-tag">${esc(scheduleCategories[item.category])}</span><button type="button" data-ps-edit="${esc(item.id)}">编辑</button></div><p>${item.all_day?'全天 / 时间待定 · ':''}${esc(localStamp(item.starts_local,item.start_timezone,item.all_day))}${item.ends_local?'<br>至 '+esc(localStamp(item.ends_local,item.end_timezone,item.all_day)):''}</p>${item.flight_number?`<p>航班 ${esc(item.flight_number)}</p>`:''}${item.location||item.destination?`<p>${esc(item.location)}${item.destination?' · 到达 '+esc(item.destination):''}</p>`:''}${item.reference?`<p>确认编号：${esc(item.reference)}</p>`:''}${item.notes?`<p class="ps-notes">${esc(item.notes)}</p>`:''}<small>最近编辑：${item.updated_by===profile.id?'你':profile.username==='sculp_jz'?'Miranda':'JZ'}${item.updated_at?' · '+esc(new Date(item.updated_at).toLocaleString('zh-CN',{timeZone:'America/Toronto'}))+'（多伦多）':''}</small></article>`).join(''):'<p class="ps-empty">当天暂无安排，可以新增行程或待办。</p>';
    controls();
  }
  async function refresh(){
    if(!alive)return;const mine=++loading;message('正在同步行程…');
    const first=month+'-01',next=new Date(first+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
    try{
      const data=[];let offset=0;
      while(true){const result=await supabase.from('miranda_schedule').select('*').lte('first_day',shiftDay(next.toISOString().slice(0,10),7)).gte('last_day',shiftDay(first,-7)).order('starts_local').order('id').range(offset,offset+499);
        if(result.error)throw result.error;if(!alive||mine!==loading)return;data.push(...(result.data||[]));if((result.data||[]).length<500)break;offset+=500;}
      items=data;loadFailed=false;render();message('已同步 · JZ / Miranda 共用');
    }catch{if(alive&&mine===loading){items=[];loadFailed=true;render();message('同步失败，请检查网络后刷新；未保存的草稿仍保留。');}}
  }
  function approveLeave(){if(busy||pending){message('当前保存尚未确认，请先重试。');return false;}return !dirty||win.confirm('放弃尚未保存的行程修改？');}
  function close(){editing=null;pending=null;dirty=false;$('[data-ps-editor]').hidden=true;}
  function typeFields(){
    const flight=f.category.value==='flight',hotel=f.category.value==='hotel';
    root.querySelectorAll('[data-ps-flight]').forEach(el=>el.hidden=!flight);
    root.querySelectorAll('[data-ps-time]').forEach(el=>el.hidden=f.all_day.checked);
    f.start_time.required=!f.all_day.checked;f.end_time.required=!f.all_day.checked&&!!f.end_date.value;
    $('[data-ps-start-label]').textContent=flight?'出发日期':hotel?'入住日期':'开始日期';
    $('[data-ps-end-label]').textContent=flight?'到达日期（可选）':hotel?'退房日期（可选）':'结束日期（可选）';
    $('[data-ps-location-label]').textContent=flight?'出发机场':hotel?'酒店名称 / 地址':'地点 / 地址';
  }
  function open(item=null){
    if(!approveLeave())return;editing=item;pending=null;form.reset();
    f.category.value=item?.category||'todo';f.title.value=item?.title||'';f.start_date.value=item?.starts_local.slice(0,10)||selected;f.start_time.value=item?.starts_local.slice(11,16)||'';
    f.end_date.value=item?.ends_local?.slice(0,10)||'';f.end_time.value=item?.ends_local?.slice(11,16)||'';f.all_day.checked=item?.all_day??true;f.completed.checked=item?.completed||false;
    for(const key of ['location','destination','flight_number','reference','notes'])f[key].value=item?.[key]||'';
    for(const side of ['start','end']){const zone=item?.[side+'_timezone']||'America/Toronto';f[side+'_timezone'].value=zones.some(x=>x[0]===zone)?zone:'UTC';f[side+'_custom_zone'].value=zones.some(x=>x[0]===zone)?'':zone;}
    dirty=false;typeFields();$('[data-ps-editor]').hidden=false;$('[data-ps-editor-title]').textContent=item?'编辑安排':'新增安排';$('[data-ps-delete]').hidden=!item;$('[data-ps-form-status]').textContent='';controls();f.title.focus();
  }
  function payload(){
    const zone=side=>{const z=f[side+'_custom_zone'].value.trim()||f[side+'_timezone'].value;try{new Intl.DateTimeFormat('en',{timeZone:z}).format();}catch{throw Error('请填写有效时区，例如 Asia/Shanghai。');}return z;};
    if(!f.title.value.trim())throw Error('请填写标题。');
    return {title:f.title.value.trim(),category:f.category.value,starts_local:f.start_date.value+'T'+(f.all_day.checked?'00:00':f.start_time.value)+':00',ends_local:f.end_date.value?f.end_date.value+'T'+(f.all_day.checked?'00:00':f.end_time.value)+':00':null,
      start_timezone:zone('start'),end_timezone:zone('end'),all_day:f.all_day.checked,completed:f.completed.checked,
      location:f.location.value.trim(),destination:f.category.value==='flight'?f.destination.value.trim():'',flight_number:f.category.value==='flight'?f.flight_number.value.trim():'',reference:f.reference.value.trim(),notes:f.notes.value.trim()};
  }
  const same=(row,data)=>Object.entries(data).every(([key,value])=>key.endsWith('_local')?(row[key]||'').replace(' ','T').slice(0,19)===(value||''):row[key]===value);
  async function persist(command){
    let result;
    if(command.version==null)result=await supabase.from('miranda_schedule').insert({id:command.id,...command.data}).select('*').maybeSingle();
    else result=await supabase.from('miranda_schedule').update(command.data).eq('id',command.id).eq('version',command.version).select('*').maybeSingle();
    if(result.error||!result.data){
      const check=await supabase.from('miranda_schedule').select('*').eq('id',command.id).maybeSingle();
      if(!check.error&&check.data&&same(check.data,command.data))return check.data;
      if(!check.error&&check.data&&command.version!=null&&check.data.version!==command.version)throw Object.assign(Error('另一位刚修改了此安排。草稿已保留，请复制需要保留的内容，取消后重新打开最新安排。'),{known:true});
      if(result.error?.code==='22023'||result.error?.code==='23514')throw Object.assign(Error('日期或时间无效：结束须晚于开始，并避开夏令时不存在的当地时间。'),{known:true});
      if(result.error?.code==='42501')throw Object.assign(Error('当前账户无权修改，请重新登录。'),{known:true});
      throw Error('保存未确认，请重试同一笔保存。');
    }return result.data;
  }
  form.addEventListener('input',()=>{dirty=true;});
  form.addEventListener('change',event=>{dirty=true;if(event.target===f.category&&f.category.value==='flight')f.all_day.checked=false;typeFields();});
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    try{pending ||= {id:editing?.id||win.crypto.randomUUID(),version:editing?.version??null,data:payload()};}catch(error){$('[data-ps-form-status]').textContent=error.message;return;}
    busy=true;controls();$('[data-ps-form-status]').textContent='正在保存…';
    try{await persist(pending);if(!alive)return;busy=false;close();controls();await refresh();if(!loadFailed)message('已保存并同步。');else message('已保存；列表暂未同步，请刷新查看。');}
    catch(error){if(!alive)return;busy=false;if(error.known)pending=null;controls();if(pending)form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);$('[data-ps-form-status]').textContent=error.message||'保存失败，请重试。';}
  };
  $('[data-ps-new]').onclick=()=>open();$('[data-ps-cancel]').onclick=()=>{if(approveLeave())close();};
  $('[data-ps-delete]').onclick=async()=>{
    if(busy||pending||!editing||!win.confirm('删除这项安排？JZ 和 Miranda 都将看不到它。'))return;
    busy=true;controls();
    try{const result=await supabase.from('miranda_schedule').delete().eq('id',editing.id).eq('version',editing.version).select('id');if(result.error)throw Error('删除未确认，请刷新后核对。');if(!result.data?.length)throw Error('此安排已被修改或删除，请重新打开后核对。');if(!alive)return;busy=false;close();controls();await refresh();message('已删除安排。');}
    catch(error){if(alive){busy=false;controls();$('[data-ps-form-status]').textContent=error.message;}}
  };
  root.addEventListener('click',event=>{
    const date=event.target.closest('[data-ps-date]');if(date&&!busy){selected=date.dataset.psDate;if(selected.slice(0,7)!==month){month=selected.slice(0,7);$('[data-ps-month]').value=month;void refresh();}else render();}
    const edit=event.target.closest('[data-ps-edit]');if(edit)open(items.find(x=>x.id===edit.dataset.psEdit));
  });
  root.addEventListener('change',async event=>{
    const check=event.target.closest('[data-ps-done]');if(!check||busy)return;
    if(pending){render();message('请先重试当前未确认的保存。');return;}
    const item=items.find(x=>x.id===check.dataset.psDone);if(!item)return;
    busy=true;controls();
    try{await persist({id:item.id,version:item.version,data:{completed:check.checked}});if(!alive)return;busy=false;await refresh();if(!loadFailed)message('完成状态已保存。');}
    catch(error){if(alive){busy=false;render();message(error.message);}}
  });
  function setMonth(value){if(!value||value<'2000-01'||value>'2100-12')return;month=value;selected=month+'-01';$('[data-ps-month]').value=month;items=[];render();void refresh();}
  $('[data-ps-month]').onchange=()=>setMonth($('[data-ps-month]').value);
  $('[data-ps-prev]').onclick=()=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);setMonth(d.toISOString().slice(0,7));};
  $('[data-ps-next]').onclick=()=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);setMonth(d.toISOString().slice(0,7));};
  $('[data-ps-today]').onclick=()=>{selected=dateAt(now(),'America/Toronto');month=selected.slice(0,7);$('[data-ps-month]').value=month;void refresh();};
  $('[data-ps-filter]').onchange=render;$('[data-ps-refresh]').onclick=()=>void refresh();
  const focus=()=>{if(!busy&&!dirty&&!pending)void refresh();};
  win.addEventListener('focus',focus);
  // Small bounded reads keep two open accounts in sync; no personal data in localStorage.
  const timer=win.setInterval(()=>{if(!doc.hidden&&!root.classList.contains('workspace-page-inactive'))focus();},30000);
  render();void refresh();
  return {canLeave:()=>!busy&&!dirty&&!pending,refresh,destroy(){alive=false;loading++;win.clearInterval(timer);win.removeEventListener('focus',focus);}};
}
