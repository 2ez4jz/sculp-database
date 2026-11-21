const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const scheduleCategories = {flight:'航班',hotel:'酒店',work:'工作',todo:'待办',personal:'个人安排'};
export const canManagePersonalSchedule = profile => profile?.active !== false &&
  (profile?.username === 'sculp_jz' && profile.role === 'operations' || profile?.username === 'sculp_miranda' && profile.role === 'owner');
const dateAt = (value, timezone) => new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const shiftDay = (day,n) => {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const scheduleOnDay = (item,day) => day >= (item.first_day || [item.starts_local.slice(0,10),item.ends_local?.slice(0,10)||item.starts_local.slice(0,10)].sort()[0]) && day <= (item.last_day || [item.starts_local.slice(0,10),item.ends_local?.slice(0,10)||item.starts_local.slice(0,10)].sort()[1]);
const zones = [['America/Toronto','多伦多'],['America/Vancouver','温哥华'],['Asia/Shanghai','中国'],['America/New_York','纽约 / 奥兰多'],['America/Los_Angeles','洛杉矶'],['Asia/Tokyo','东京'],['Asia/Hong_Kong','香港'],['Europe/London','伦敦'],['Europe/Paris','巴黎'],['UTC','UTC']];
const zoneNames = Object.fromEntries(zones);
const dayFormatter = new Intl.DateTimeFormat('zh-CN', {timeZone:'UTC', month:'long', day:'numeric', weekday:'short'});
const monthFormatter = new Intl.DateTimeFormat('zh-CN', {timeZone:'UTC', year:'numeric', month:'long'});
const asDate = day => new Date(`${day}T12:00:00Z`);
const firstDay = '2000-01-01';
const lastDay = '2100-12-31';

function localStamp(stamp, timezone, allDay, day) {
  const date = stamp.slice(0, 10);
  return [date !== day || allDay ? date : '', allDay ? '' : `${stamp.slice(11,16)} ${zoneNames[timezone] || timezone}`].filter(Boolean).join(' ');
}

function personalRow(item, day) {
  const start = localStamp(item.starts_local, item.start_timezone, item.all_day, day);
  const end = item.ends_local && localStamp(item.ends_local, item.end_timezone, item.all_day, day);
  const time = end ? `${start} 至 ${end}` : !item.all_day ? start : item.category==='todo' ? '' : '全天 / 时间待定';
  const route = [item.location, item.destination].filter(Boolean).join(' 至 ');
  const meta = [time, item.flight_number, route].filter(Boolean).join(' · ');
  const details = item.reference || item.notes ? `
    <details class="ps-item-details" data-ps-details="${esc(item.id)}">
      <summary>${item.notes && item.reference ? '备注与编号' : item.notes ? '备注' : '预订编号'}</summary>
      ${item.reference ? `<p>确认编号：${esc(item.reference)}</p>` : ''}
      ${item.notes ? `<p class="ps-notes">${esc(item.notes)}</p>` : ''}
    </details>` : '';
  return `<li class="ps-item${item.completed ? ' ps-completed' : ''}">
    <input type="checkbox" data-ps-done="${esc(item.id)}" aria-label="完成 ${esc(item.title)}" ${item.completed ? 'checked' : ''}>
    <div class="ps-item-body">
      <div class="ps-item-title"><strong>${esc(item.title)}</strong><span class="ps-tag">${esc(scheduleCategories[item.category])}</span></div>
      ${meta ? `<p class="ps-meta">${esc(meta)}</p>` : ''}${details}
    </div>
    <button type="button" class="ps-row-action" data-ps-edit="${esc(item.id)}" aria-label="编辑 ${esc(item.title)}">编辑</button>
  </li>`;
}

function workTaskRow(task) {
  const done = task.status === 'done';
  return `<li class="ps-item${done ? ' ps-completed' : ''}">
    <span class="ps-task-state" role="img" aria-label="${done ? '已完成' : '待完成'}"></span>
    <div class="ps-item-title"><strong>${esc(task.reason)}</strong><span class="ps-tag">工作待办</span></div>
    <button type="button" class="ps-row-action" data-ps-work-task="${esc(task.id)}" aria-label="处理 ${esc(task.reason)}">处理</button>
  </li>`;
}

async function readPages(pageSize, fetchPage, isCurrent) {
  const rows = [];
  for (let offset = 0; isCurrent(); offset += pageSize) {
    const {data, error} = await fetchPage(offset);
    if (error || !Array.isArray(data)) throw Error('Schedule read failed');
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

export function mountPersonalSchedule({root,supabase,profile,onWorkTask,now=()=>new Date()}) {
  if(!canManagePersonalSchedule(profile)){root.replaceChildren();return {canLeave:()=>true,refresh:async()=>{},destroy(){}};}
  const doc=root.ownerDocument,win=doc.defaultView;
  const today = () => dateAt(now(), 'America/Toronto');
  let alive=true, selected=today(), pickerMonth=selected.slice(0,7), loadVersion=0;
  let items=[], workTasks=[], loaded=false, loadFailed=false, workFailed=false, lastMarkup='';
  let busy=false, dirty=false, editing=null, pending=null;
  root.className='cloud-orders personal-schedule';root.dataset.osPersonal='';
  root.innerHTML=`<header class="ps-heading">
    <h3>Miranda 行程</h3>
    <div class="ps-heading-actions">
      <button type="button" class="ps-date-toggle" data-ps-toggle aria-expanded="false" aria-controls="ps-date-picker">
        <span class="sr-only">选择日期：</span><span data-ps-date-label></span>
      </button>
      <button type="button" class="auth-primary" data-ps-new aria-label="新增行程或待办">新增</button>
    </div>
    <div class="ps-date-picker" id="ps-date-picker" data-ps-picker hidden aria-label="选择日期">
      <div class="ps-calendar-heading">
        <button type="button" data-ps-prev aria-label="上个月">上月</button>
        <strong data-ps-month aria-live="polite"></strong>
        <button type="button" data-ps-next aria-label="下个月">下月</button>
      </div>
      <div class="ps-calendar" data-ps-calendar></div>
      <button type="button" class="ps-today" data-ps-today>回到今天</button>
    </div>
  </header>
  <div data-ps-items aria-label="当天行程与待办"></div>
  <p class="ps-status" role="status" data-ps-status></p>
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
  <label class="ps-check"><input name="completed" type="checkbox">已完成</label><p class="cloud-note">航班填写出发和到达的当地时间。酒店填写入住和退房日期。</p>
  <p class="ps-edit-meta" data-ps-edit-meta></p>
  <div class="ps-actions"><button type="submit" class="auth-primary" data-ps-save>保存安排</button><button type="button" data-ps-cancel>取消</button><button type="button" data-ps-delete hidden>删除安排</button></div><p role="status" aria-live="polite" data-ps-form-status></p></form></section>`;
  const $=s=>root.querySelector(s),form=$('[data-ps-form]'),f=form.elements;
  const picker=$('[data-ps-picker]'), dateToggle=$('[data-ps-toggle]'), agenda=$('[data-ps-items]');
  for(const field of ['start_timezone','end_timezone'])f[field].innerHTML=zones.map(([id,label])=>`<option value="${id}">${label} · ${id}</option>`).join('');
  const message=text=>{if(alive)$('[data-ps-status]').textContent=text;};
  function controls() {
    root.querySelectorAll('button,[data-ps-done]').forEach(el => el.disabled=busy);
    $('[data-ps-prev]').disabled=busy || pickerMonth==='2000-01';
    $('[data-ps-next]').disabled=busy || pickerMonth==='2100-12';
    form.querySelectorAll('input,select,textarea').forEach(el => el.disabled=busy || !!pending);
  }
  function render(force=false) {
    const currentDay = today();
    const year = selected.slice(0,4)!==currentDay.slice(0,4) ? `${selected.slice(0,4)}年 ` : '';
    $('[data-ps-date-label]').textContent=(selected===currentDay ? '今天 · ' : year)+dayFormatter.format(asDate(selected));
    const schedule = items.filter(item => scheduleOnDay(item, selected));
    const dueTasks = workTasks.filter(task => task.due_on===selected);
    const rows = [
      ...schedule.map(item => ({done:item.completed, html:personalRow(item, selected)})),
      ...dueTasks.map(task => ({done:task.status==='done', html:workTaskRow(task)})),
    ].sort((a,b) => Number(a.done)-Number(b.done));
    const errors = [loadFailed && '行程', workFailed && '工作待办'].filter(Boolean);
    const note = errors.length ? `<div class="ps-read-error"><p>${errors.join('和')}暂未读到。</p><button type="button" data-ps-retry>重试</button></div>` : '';
    const content = rows.length ? `<ul class="ps-agenda">${rows.map(row => row.html).join('')}</ul>` : '';
    const empty = !loaded ? '正在读取当天安排…' : !rows.length && !note ? '当天暂无行程或待办。' : '';
    const markup = content + (empty ? `<p class="ps-empty">${empty}</p>` : '') + note;
    if (force || markup!==lastMarkup) {
      const openDetails = new Set([...agenda.querySelectorAll('details[open]')].map(el => el.dataset.psDetails));
      agenda.innerHTML=markup;
      agenda.querySelectorAll('details').forEach(el => el.open=openDetails.has(el.dataset.psDetails));
      lastMarkup=markup;
    }
    controls();
  }
  async function refresh() {
    if (!alive) return;
    const mine = ++loadVersion;
    const isCurrent = () => alive && mine===loadVersion;
    const from = `${selected.slice(0,7)}-01`;
    const next = asDate(from);
    next.setUTCMonth(next.getUTCMonth()+1);
    const to = next.toISOString().slice(0,10);
    const [schedule, tasks] = await Promise.allSettled([
      readPages(500, offset => supabase.from('miranda_schedule').select('*')
        .lte('first_day',shiftDay(to,-1)).gte('last_day',from).order('starts_local').order('id').range(offset,offset+499), isCurrent),
      readPages(100, offset => supabase.rpc('sculpy_miranda_daily_work_tasks',{p_from:from,p_to:to,p_offset:offset}), isCurrent),
    ]);
    if (!isCurrent()) return;
    items=schedule.value ?? [];
    workTasks=tasks.value ?? [];
    loadFailed=schedule.status==='rejected';
    workFailed=tasks.status==='rejected';
    loaded=true;
    render();
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
    const actor = item?.updated_by===profile.id ? '你' : profile.username==='sculp_jz' ? 'Miranda' : 'JZ';
    $('[data-ps-edit-meta]').textContent = item?.updated_at
      ? `最近编辑：${actor} · ${new Date(item.updated_at).toLocaleString('zh-CN',{timeZone:'America/Toronto'})}（多伦多）`
      : '';
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
      if(!check.error&&check.data&&command.version!=null&&check.data.version!==command.version)throw Object.assign(Error('另一位刚修改了此安排。草稿已保留，请复制需要保留的内容，取消后重新打开最新安排。'),{known:true,conflict:true});
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
    catch(error){if(!alive)return;busy=false;if(error.known)pending=null;controls();$('[data-ps-form-status]').textContent=error.message||'保存失败，请重试。';if(error.conflict)void refresh();}
  };
  $('[data-ps-new]').onclick=()=>open();$('[data-ps-cancel]').onclick=()=>{if(approveLeave())close();};
  $('[data-ps-delete]').onclick=async()=>{
    if(busy||pending||!editing||!win.confirm('删除这项安排？JZ 和 Miranda 都将看不到它。'))return;
    busy=true;controls();
    try{const result=await supabase.from('miranda_schedule').delete().eq('id',editing.id).eq('version',editing.version).select('id');if(result.error)throw Error('删除未确认，请刷新后核对。');if(!result.data?.length)throw Error('此安排已被修改或删除，请重新打开后核对。');if(!alive)return;busy=false;close();controls();await refresh();message('已删除安排。');}
    catch(error){if(alive){busy=false;controls();$('[data-ps-form-status]').textContent=error.message;}}
  };
  function renderCalendar(focusDay) {
    const first = `${pickerMonth}-01`;
    const weekday = (asDate(first).getUTCDay()+6)%7;
    const start = shiftDay(first,-weekday);
    const currentDay = today();
    const tabbableDay = focusDay || (selected.slice(0,7)===pickerMonth ? selected : first);
    $('[data-ps-month]').textContent = monthFormatter.format(asDate(first));
    $('[data-ps-calendar]').innerHTML = ['一','二','三','四','五','六','日']
      .map(day => `<span class="ps-weekday" aria-hidden="true">${day}</span>`).join('')
      + Array.from({length:42}, (_,index) => {
        const day = shiftDay(start,index);
        if (day<firstDay || day>lastDay) return '<span></span>';
        const outside = day.slice(0,7)!==pickerMonth ? ' ps-outside' : '';
        return `<button type="button" class="ps-date${outside}" data-ps-date="${day}" aria-label="${day}" tabindex="${day===tabbableDay ? 0 : -1}"
          aria-pressed="${day===selected}" ${day===currentDay ? 'aria-current="date"' : ''}>${Number(day.slice(8))}</button>`;
      }).join('');
    controls();
  }
  function closeCalendar(restoreFocus=false) {
    picker.hidden=true;
    dateToggle.setAttribute('aria-expanded','false');
    if (restoreFocus) dateToggle.focus();
  }
  function selectDay(day) {
    if (day!==selected) {
      if (!approveLeave()) return;
      close();
      const newMonth = selected.slice(0,7)!==day.slice(0,7);
      selected=day;
      message('');
      if (newMonth) {
        items=[];
        workTasks=[];
        loaded=loadFailed=workFailed=false;
        void refresh();
      }
      render();
    }
    closeCalendar(true);
  }
  function movePickerMonth(delta) {
    const month = asDate(`${pickerMonth}-01`);
    month.setUTCMonth(month.getUTCMonth()+delta);
    pickerMonth=month.toISOString().slice(0,7);
    renderCalendar();
  }
  dateToggle.onclick=()=>{
    if (!picker.hidden) {closeCalendar();return;}
    pickerMonth=selected.slice(0,7);
    picker.hidden=false;
    dateToggle.setAttribute('aria-expanded','true');
    renderCalendar();
    $(`[data-ps-date="${selected}"]`)?.focus();
  };
  $('[data-ps-prev]').onclick=()=>movePickerMonth(-1);
  $('[data-ps-next]').onclick=()=>movePickerMonth(1);
  $('[data-ps-today]').onclick=()=>selectDay(today());
  root.addEventListener('keydown',event=>{
    if (event.key==='Escape' && !picker.hidden) {
      event.preventDefault();
      closeCalendar(true);
      return;
    }
    const day=event.target.dataset.psDate;
    const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
    if (!day || !step || busy) return;
    event.preventDefault();
    const next=shiftDay(day,step);
    if (next<firstDay || next>lastDay) return;
    if (!$(`[data-ps-date="${next}"]`)) {
      pickerMonth=next.slice(0,7);
      renderCalendar(next);
    }
    event.target.tabIndex=-1;
    const nextButton=$(`[data-ps-date="${next}"]`);
    nextButton.tabIndex=0;
    nextButton.focus();
  });
  const dismissPicker = event => {
    if (!picker.hidden && !picker.contains(event.target) && !dateToggle.contains(event.target)) closeCalendar();
  };
  doc.addEventListener('pointerdown',dismissPicker);
  root.addEventListener('click',event=>{
    const button = event.target.closest('button');
    if (!button || busy) return;
    if (button.dataset.psDate) selectDay(button.dataset.psDate);
    if (button.hasAttribute('data-ps-retry')) void refresh();
    if (button.dataset.psEdit) open(items.find(item=>item.id===button.dataset.psEdit));
    if (button.dataset.psWorkTask) {
      const task = workTasks.find(item=>item.id===button.dataset.psWorkTask);
      if (task && onWorkTask?.(task)===false) message('请先保存或取消正在编辑的安排。');
    }
  });
  root.addEventListener('change',async event=>{
    const check=event.target.closest('[data-ps-done]');if(!check||busy)return;
    if(pending){render(true);message('请先重试当前未确认的保存。');return;}
    const item=items.find(x=>x.id===check.dataset.psDone);if(!item)return;
    busy=true;controls();
    try{await persist({id:item.id,version:item.version,data:{completed:check.checked}});if(!alive)return;busy=false;await refresh();if(!loadFailed)message('完成状态已保存。');}
    catch(error){if(alive){busy=false;render(true);message(error.message);if(error.conflict)void refresh();}}
  });
  const focus=()=>{if(!busy&&!dirty&&!pending&&!root.classList.contains('workspace-page-inactive'))void refresh();};
  win.addEventListener('focus',focus);
  // Small bounded reads keep two open accounts in sync; no personal data in localStorage.
  const timer=win.setInterval(()=>{if(!doc.hidden&&!root.classList.contains('workspace-page-inactive'))focus();},30000);
  render();void refresh();
  return {
    canLeave:()=>!busy&&!dirty&&!pending,
    refresh,
    closeCalendar,
    destroy(){
      alive=false;
      loadVersion++;
      win.clearInterval(timer);
      win.removeEventListener('focus',focus);
      doc.removeEventListener('pointerdown',dismissPicker);
    },
  };
}
