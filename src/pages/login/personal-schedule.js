import {mountAgendaComments} from './agenda-comments.js?v=day-comments-20261121';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const scheduleCategories = {flight:'航班',hotel:'酒店',work:'工作',todo:'待办',personal:'个人安排'};
export const canManagePersonalSchedule = profile => profile?.active !== false &&
  (profile?.username === 'sculp_jz' && profile.role === 'operations' || profile?.username === 'sculp_miranda' && profile.role === 'owner');
const dateAt = (value, timezone) => new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const chinaStart = '2026-11-23';
const chinaMidnight = Date.parse(`${chinaStart}T00:00:00+08:00`);
export const itineraryTimeZone = now => Number(now)>=chinaMidnight ? 'Asia/Shanghai' : 'America/Toronto';
const planZone = day => day>=chinaStart ? 'Asia/Shanghai' : 'America/Toronto';
const shiftDay = (day,n) => {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const agendaTimes = item => [item.agenda_start_local || item.starts_local, item.agenda_end_local || item.ends_local];
export function scheduleOnDay(item,day) {
  const [start,end] = agendaTimes(item);
  const [first,last] = [start.slice(0,10),(end || start).slice(0,10)].sort();
  return day >= first && day <= last;
}
const afterTimedItems = '24:00';
const milestoneLabels = {flight:{start:'航班起飞',end:'航班抵达'},hotel:{start:'酒店入住'}};
const zones = [['America/Toronto','多伦多'],['America/Vancouver','温哥华'],['Asia/Shanghai','北京时间'],['America/New_York','纽约 / 奥兰多'],['America/Los_Angeles','洛杉矶'],['Asia/Tokyo','东京'],['Asia/Hong_Kong','香港'],['Europe/London','伦敦'],['Europe/Paris','巴黎'],['UTC','UTC']];
const zoneNames = Object.fromEntries(zones);
const dayFormatter = new Intl.DateTimeFormat('zh-CN', {timeZone:'UTC', month:'long', day:'numeric', weekday:'short'});
const monthFormatter = new Intl.DateTimeFormat('zh-CN', {timeZone:'UTC', year:'numeric', month:'long'});
const asDate = day => new Date(`${day}T12:00:00Z`);
const firstDay = '2000-01-01';
const lastDay = '2100-12-31';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const leadChoices = [[0,'关闭'],[15,'提前 15 分钟'],[30,'提前 30 分钟'],[60,'提前 1 小时'],[90,'提前 90 分钟'],[120,'提前 2 小时'],[180,'提前 3 小时'],[240,'提前 4 小时'],[360,'提前 6 小时'],[720,'提前 12 小时'],[1440,'提前 1 天']];
const leadOptions = `<option value="">默认</option>${leadChoices.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}`;
const leadLabel = Object.fromEntries(leadChoices);

function localStamp(stamp, timezone, allDay, day, agendaStamp) {
  const date = stamp.slice(0, 10);
  const local = [date !== day || allDay ? date : '', allDay ? '' : `${stamp.slice(11,16)} ${zoneNames[timezone] || timezone}`].filter(Boolean).join(' ');
  return !allDay && agendaStamp && stamp.slice(0,16)!==agendaStamp.slice(0,16)
    ? `${local}（${localStamp(agendaStamp,'Asia/Shanghai',false,day)}）` : local;
}

function personalRow(item, day, milestone) {
  const start = localStamp(item.starts_local, item.start_timezone, item.all_day, day,item.agenda_start_local);
  const end = item.ends_local && localStamp(item.ends_local, item.end_timezone, item.all_day, day,item.agenda_end_local);
  const time = end ? `${start} 至 ${end}` : !item.all_day ? start : item.category==='todo' ? '' : '全天 / 时间待定';
  const route = [item.location, item.destination].filter(Boolean).join(' 至 ');
  const meta = [time, item.flight_number, route].filter(Boolean).join(' · ');
  const details = item.reference || item.notes ? `
    <details class="ps-item-details" data-ps-details="${esc(item.id)}">
      <summary>${item.notes && item.reference ? '备注与编号' : item.notes ? '备注' : '预订编号'}</summary>
      ${item.reference ? `<p>确认编号：${esc(item.reference)}</p>` : ''}
      ${item.notes ? `<p class="ps-notes">${esc(item.notes)}</p>` : ''}
    </details>` : '';
  return `<li class="ps-item${item.completed ? ' ps-completed' : ''}" data-ps-item="${esc(item.id)}" tabindex="-1">
    <input type="checkbox" data-ps-done="${esc(item.id)}" aria-label="完成 ${esc(item.title)}" ${item.completed ? 'checked' : ''}>
    <div class="ps-item-body">
      <div class="ps-item-title"><strong>${esc(item.title)}</strong><span class="ps-tag${milestone ? ' ps-tag-milestone' : ''}">${esc(milestone || scheduleCategories[item.category])}</span></div>
      ${meta ? `<p class="ps-meta">${esc(meta)}</p>` : ''}${details}
    </div>
    <button type="button" class="ps-row-action" data-ps-edit="${esc(item.id)}" aria-label="编辑 ${esc(item.title)}">编辑</button>
  </li>`;
}

function scheduleEntry(item,day) {
  const [start,end] = agendaTimes(item);
  const startsToday = start.slice(0,10) === day;
  const stamp = startsToday ? start : end?.slice(0,10) === day ? end : null;
  const milestone = stamp && milestoneLabels[item.category]?.[startsToday ? 'start' : 'end'];
  return {
    time: !item.all_day && stamp ? stamp.slice(11) : afterTimedItems,
    done: Boolean(item.completed),
    html: personalRow(item,day,milestone),
  };
}

function workTaskRow(task,day) {
  const done = task.status === 'done';
  return `<li class="ps-item${done ? ' ps-completed' : ''}">
    <input type="checkbox" data-ps-work-done="${esc(task.id)}" aria-label="完成 ${esc(task.reason)}" ${done?'checked':''}>
    <div class="ps-item-body"><div class="ps-item-title"><strong>${esc(task.reason)}</strong><span class="ps-tag">${esc(task.assignee||'工作待办')}</span></div>
    ${task.due_on<day?`<p class="ps-meta">原定 ${esc(task.due_on)}</p>`:''}</div>
    <button type="button" class="ps-row-action" data-ps-work-task="${esc(task.id)}" aria-label="处理 ${esc(task.reason)}">处理</button>
  </li>`;
}

function marketingRow(post,checked,day) {
  return `<li class="ps-item${checked?' ps-completed':''}">
    <input type="checkbox" data-ps-marketing-done="${post.id}" aria-label="完成 ${esc(post.title)}" ${checked?'checked':''}>
    <div class="ps-item-body"><div class="ps-item-title"><strong>${esc(post.title)}</strong><span class="ps-tag">Marketing · ${esc(post.platform)}</span></div>
    ${post.date<day?`<p class="ps-meta">原定 ${esc(post.date)}</p>`:''}</div>
    <button type="button" class="ps-row-action" data-ps-marketing="${post.id}">查看</button>
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

export function mountPersonalSchedule({root,supabase,profile,onWorkTask,onMarketing,onWorkChange,now=()=>new Date()}) {
  if(!canManagePersonalSchedule(profile)){root.replaceChildren();return {canLeave:()=>true,refresh:async()=>{},destroy(){}};}
  const doc=root.ownerDocument,win=doc.defaultView;
  const today = () => {const current=now();return dateAt(current,itineraryTimeZone(current));};
  let alive=true, selected=today(), pickerMonth=selected.slice(0,7), loadVersion=0;
  let items=[], workTasks=[], marketingState=[], loaded=false, loadFailed=false, workFailed=false, marketingFailed=false, lastMarkup='';
  let workCommand=null;
  let busy=false, dirty=false, editing=null, pending=null, followToday=true, changedZones=new Set();
  root.className='cloud-orders personal-schedule';root.dataset.osPersonal='';
  root.innerHTML=`<header class="ps-heading">
    <h3>Miranda 行程</h3>
    <div class="ps-heading-actions">
      <div class="ps-day-navigation" role="group" aria-label="按天切换日期">
      <button type="button" class="ps-day-step" data-ps-day-prev aria-label="前一天" title="前一天">‹</button>
      <button type="button" class="ps-date-toggle" data-ps-toggle aria-expanded="false" aria-controls="ps-date-picker">
        <span class="sr-only">选择日期：</span><span data-ps-date-label aria-live="polite"></span>
      </button>
      <button type="button" class="ps-day-step" data-ps-day-next aria-label="后一天" title="后一天">›</button>
      </div>
      <small class="ps-clock" data-ps-clock></small>
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
  <button type="button" data-ps-work-retry hidden>重试完成状态</button>
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
  <details class="ps-reminder-settings" data-ps-reminders>
    <summary data-ps-reminder-summary>推送提醒</summary>
    <p class="cloud-note" data-ps-reminder-help></p>
    <div class="ps-form-grid" data-ps-reminder-fields>
      <label><span data-ps-reminder-start>开始前</span><select name="reminder_start_minutes">${leadOptions}</select></label>
      <label data-ps-reminder-end-wrap><span data-ps-reminder-end>结束前</span><select name="reminder_end_minutes">${leadOptions}</select></label>
      <label>前一晚 22:00<select name="reminder_evening">
        <option value="auto">早上 9 点前自动提醒</option><option value="always">为开始时间开启前夜提醒</option><option value="off">关闭前夜提醒</option>
      </select></label>
    </div>
  </details>
  <label class="ps-check"><input name="completed" type="checkbox">已完成</label><p class="cloud-note">航班填写出发和到达的当地时间。酒店填写入住和退房日期。</p>
  <p class="ps-edit-meta" data-ps-edit-meta></p>
  <div class="ps-actions"><button type="submit" class="auth-primary" data-ps-save>保存安排</button><button type="button" data-ps-cancel>取消</button><button type="button" data-ps-delete hidden>删除安排</button></div><p role="status" aria-live="polite" data-ps-form-status></p></form></section>
  <section class="ps-comments" data-ps-thread aria-label="当日留言"></section>`;
  const $=s=>root.querySelector(s),form=$('[data-ps-form]'),f=form.elements;
  const picker=$('[data-ps-picker]'), dateToggle=$('[data-ps-toggle]'), agenda=$('[data-ps-items]');
  const comments=mountAgendaComments({root:$('[data-ps-thread]'),supabase,profile,zoneForDay:planZone,selectDay,readPages});
  comments.setDay(selected);
  for(const field of ['start_timezone','end_timezone'])f[field].innerHTML=zones.map(([id,label])=>`<option value="${id}">${label} · ${id}</option>`).join('');
  const message=text=>{if(alive)$('[data-ps-status]').textContent=text;};
  function controls() {
    root.querySelectorAll('button:not([data-ps-thread] button),[data-ps-done],[data-ps-work-done],[data-ps-marketing-done]').forEach(el => el.disabled=busy||!!workCommand);
    $('[data-ps-work-retry]').hidden=!workCommand;
    $('[data-ps-work-retry]').disabled=busy;
    $('[data-ps-prev]').disabled=busy || pickerMonth==='2000-01';
    $('[data-ps-next]').disabled=busy || pickerMonth==='2100-12';
    $('[data-ps-day-prev]').disabled=busy || selected===firstDay;
    $('[data-ps-day-next]').disabled=busy || selected===lastDay;
    form.querySelectorAll('input,select,textarea').forEach(el => el.disabled=busy || !!pending || !!workCommand);
  }
  function render(force=false) {
    const currentDay = today();
    const year = selected.slice(0,4)!==currentDay.slice(0,4) ? `${selected.slice(0,4)}年 ` : '';
    $('[data-ps-date-label]').textContent=(selected===currentDay ? '今天 · ' : year)+dayFormatter.format(asDate(selected));
    $('[data-ps-clock]').textContent=planZone(selected)==='Asia/Shanghai' ? '北京时间' : '多伦多时间';
    const schedule = items.filter(item => scheduleOnDay(item, selected));
    const dueTasks = workTasks.filter(task => task.status==='open'?task.due_on<=selected:task.due_on===selected||task.completed_on===selected);
    const postState=new Map(marketingState.map(state=>[state.post_id,state]));
    const posts=marketingFailed?[]:holidayContentPlan.filter(post=>{
      if(post.date>selected)return false;
      const state=postState.get(post.id);
      return !state?.checked || post.date===selected || state.updated_at&&dateAt(new Date(state.updated_at),planZone(selected))===selected;
    });
    const rows = [
      ...schedule.map(item => scheduleEntry(item,selected)),
      ...dueTasks.map(task => ({time:afterTimedItems,done:task.status==='done',html:workTaskRow(task,selected)})),
      ...posts.map(post=>({time:afterTimedItems,done:Boolean(postState.get(post.id)?.checked),html:marketingRow(post,postState.get(post.id)?.checked,selected)})),
    ].sort((a,b) => a.time.localeCompare(b.time) || Number(a.done)-Number(b.done));
    const errors = [loadFailed && '行程', workFailed && '工作待办',marketingFailed&&'Marketing 任务'].filter(Boolean);
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
    const currentDay = today();
    if (followToday && !dirty && !busy && !pending && !workCommand && comments.canLeave() && selected!==currentDay) {
      updateSelectedDay(currentDay);
      render();
    }
    const mine = ++loadVersion;
    const isCurrent = () => alive && mine===loadVersion;
    const from = `${selected.slice(0,7)}-01`;
    const next = asDate(from);
    next.setUTCMonth(next.getUTCMonth()+1);
    const to = next.toISOString().slice(0,10);
    const commentsLoaded=comments.refresh();
    const [schedule, tasks,marketing] = await Promise.allSettled([
      // Airport dates can differ from the planner's day by one day in either direction.
      readPages(500, offset => supabase.from('miranda_schedule').select('*')
        .lte('first_day',to).gte('last_day',shiftDay(from,-1)).order('agenda_start_local').order('id').range(offset,offset+499), isCurrent),
      readPages(100, offset => supabase.rpc('sculpy_shared_daily_work_tasks',{p_day:selected,p_offset:offset}), isCurrent),
      supabase.from('marketing_checklist_state').select('post_id,checked,updated_at').eq('campaign','holiday-2026').eq('task_index',50),
    ]);
    if (!isCurrent()) return;
    items=schedule.value ?? [];
    workTasks=tasks.value ?? [];
    marketingState=marketing.value?.data??[];
    loadFailed=schedule.status==='rejected';
    workFailed=tasks.status==='rejected';
    marketingFailed=marketing.status==='rejected'||!!marketing.value?.error||!Array.isArray(marketing.value?.data);
    loaded=true;
    render();
    await commentsLoaded;
  }
  function approveLeave(){if(busy||pending||workCommand){message('当前保存尚未确认，请先重试。');return false;}return !dirty||win.confirm('放弃尚未保存的行程修改？');}
  function close(){editing=null;pending=null;dirty=false;$('[data-ps-editor]').hidden=true;}
  function typeFields(){
    const flight=f.category.value==='flight',hotel=f.category.value==='hotel';
    root.querySelectorAll('[data-ps-flight]').forEach(el=>el.hidden=!flight);
    root.querySelectorAll('[data-ps-time]').forEach(el=>el.hidden=f.all_day.checked);
    f.start_time.required=!f.all_day.checked;f.end_time.required=!f.all_day.checked&&!!f.end_date.value;
    $('[data-ps-start-label]').textContent=flight?'出发日期':hotel?'入住日期':'开始日期';
    $('[data-ps-end-label]').textContent=flight?'到达日期（可选）':hotel?'退房日期（可选）':'结束日期（可选）';
    $('[data-ps-location-label]').textContent=flight?'出发机场':hotel?'酒店名称 / 地址':'地点 / 地址';
    const startDefault=flight?180:hotel?60:30, endDefault=hotel?60:0;
    const timed=!f.all_day.checked, lead=leadLabel[f.reminder_start_minutes.value || startDefault];
    f.reminder_start_minutes.options[0].textContent=`默认 · ${leadLabel[startDefault]}`;
    f.reminder_end_minutes.options[0].textContent=`默认 · ${leadLabel[endDefault]}`;
    $('[data-ps-reminder-start]').textContent=flight?'起飞前':hotel?'入住前':'开始前';
    $('[data-ps-reminder-end]').textContent=flight?'到达前':hotel?'退房前':'结束前';
    $('[data-ps-reminder-end-wrap]').hidden=!f.end_date.value;
    $('[data-ps-reminder-fields]').hidden=!timed;
    $('[data-ps-reminder-summary]').textContent=timed&&lead!=='关闭'?`推送提醒 · ${lead}`:'推送提醒';
    $('[data-ps-reminder-help]').textContent=timed?'早起提醒使用行程页时钟。收到提醒需要在「设置」开启行程提醒和设备推送。':'填入具体时间后可设推送提醒。';
  }
  function open(item=null){
    if(!approveLeave())return;editing=item;pending=null;form.reset();
    f.category.value=item?.category||'todo';f.title.value=item?.title||'';f.start_date.value=item?.starts_local.slice(0,10)||selected;f.start_time.value=item?.starts_local.slice(11,16)||'';
    f.end_date.value=item?.ends_local?.slice(0,10)||'';f.end_time.value=item?.ends_local?.slice(11,16)||'';f.all_day.checked=item?.all_day??true;f.completed.checked=item?.completed||false;
    for(const key of ['location','destination','flight_number','reference','notes'])f[key].value=item?.[key]||'';
    changedZones=new Set();
    for(const side of ['start','end']){
      const zone=item?.[side+'_timezone']||planZone(selected);
      f[side+'_timezone'].value=Object.hasOwn(zoneNames,zone)?zone:'UTC';
      f[side+'_custom_zone'].value=Object.hasOwn(zoneNames,zone)?'':zone;
    }
    f.reminder_start_minutes.value=item?.reminder_start_minutes??'';
    f.reminder_end_minutes.value=item?.reminder_end_minutes??'';
    f.reminder_evening.value=item?.reminder_evening||'auto';
    $('[data-ps-reminders]').open=false;
    const actor = item?.updated_by===profile.id ? '你' : profile.username==='sculp_jz' ? 'Miranda' : 'JZ';
    const editZone = itineraryTimeZone(now());
    $('[data-ps-edit-meta]').textContent = item?.updated_at
      ? `最近编辑：${actor} · ${new Date(item.updated_at).toLocaleString('zh-CN',{timeZone:editZone})}（${zoneNames[editZone]}）`
      : '';
    dirty=false;typeFields();$('[data-ps-editor]').hidden=false;$('[data-ps-editor-title]').textContent=item?'编辑安排':'新增安排';$('[data-ps-delete]').hidden=!item;$('[data-ps-form-status]').textContent='';controls();f.title.focus();
  }
  function payload(){
    const zone=side=>{const z=f[side+'_custom_zone'].value.trim()||f[side+'_timezone'].value;try{new Intl.DateTimeFormat('en',{timeZone:z}).format();}catch{throw Error('请填写有效时区，例如 Asia/Shanghai。');}return z;};
    if(!f.title.value.trim())throw Error('请填写标题。');
    return {title:f.title.value.trim(),category:f.category.value,starts_local:f.start_date.value+'T'+(f.all_day.checked?'00:00':f.start_time.value)+':00',ends_local:f.end_date.value?f.end_date.value+'T'+(f.all_day.checked?'00:00':f.end_time.value)+':00':null,
      start_timezone:zone('start'),end_timezone:zone('end'),all_day:f.all_day.checked,completed:f.completed.checked,
      reminder_start_minutes:f.reminder_start_minutes.value===''?null:Number(f.reminder_start_minutes.value),
      reminder_end_minutes:f.reminder_end_minutes.value===''?null:Number(f.reminder_end_minutes.value),
      reminder_evening:f.reminder_evening.value,
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
  form.addEventListener('change',event=>{
    dirty=true;
    if(event.target===f.category&&f.category.value==='flight')f.all_day.checked=false;
    for(const side of ['start','end']){
      if(event.target===f[side+'_timezone']||event.target===f[side+'_custom_zone'])changedZones.add(side);
      const dateField=f[side+'_date'];
      if(!editing&&event.target===dateField&&dateField.value&&!changedZones.has(side))f[side+'_timezone'].value=planZone(dateField.value);
    }
    typeFields();
  });
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
  function updateSelectedDay(day) {
    const newMonth=selected.slice(0,7)!==day.slice(0,7);
    selected=day;
    comments.setDay(day);
    message('');
    if(newMonth){
      items=[];
      workTasks=[];
      loaded=loadFailed=workFailed=false;
    }
    return newMonth;
  }
  function selectDay(day,restoreFocus=true) {
    if (day!==selected) {
      if (!approveLeave()||!comments.canChangeDay()) return;
      close();
      followToday=day===today();
      updateSelectedDay(day);
      void refresh();
      render();
    }
    closeCalendar(restoreFocus);
  }
  async function openReminder({date,id}) {
    if(!uuid.test(id||'')||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||date<firstDay||date>lastDay||!approveLeave()||(date!==selected&&!comments.canChangeDay()))return false;
    close();
    closeCalendar();
    followToday=date===today();
    updateSelectedDay(date);
    render();
    await refresh();
    const row=$(`[data-ps-item="${id}"]`);
    if(!row||root.classList.contains('workspace-page-inactive'))return false;
    row.focus({preventScroll:true});
    row.scrollIntoView?.({block:'center'});
    return true;
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
  $('[data-ps-day-prev]').onclick=()=>selectDay(shiftDay(selected,-1),false);
  $('[data-ps-day-next]').onclick=()=>selectDay(shiftDay(selected,1),false);
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
    if (button.hasAttribute('data-ps-work-retry')) void saveWorkCommand();
    if (button.dataset.psMarketing&&approveLeave()) {close();onMarketing?.(Number(button.dataset.psMarketing));}
    if (button.dataset.psEdit) open(items.find(item=>item.id===button.dataset.psEdit));
    if (button.dataset.psWorkTask) {
      const task = workTasks.find(item=>item.id===button.dataset.psWorkTask);
      if (task && onWorkTask?.(task)===false) message('请先保存或取消正在编辑的安排。');
    }
  });
  async function saveWorkCommand(){
    if(!workCommand||busy)return;
    busy=true;controls();message('正在保存完成状态…');
    try{
      const {method,args}=workCommand;
      const {data,error}=await supabase.rpc(method,args);
      if(error)throw error;
      if(method==='sculpy_os_update_task'?(data?.id!==args.p_task_id||data?.requestId!==args.p_request_id):data?.checked!==args.p_checked)throw Error('Unconfirmed task update');
      workCommand=null;busy=false;
      if(!alive)return;
      await refresh();
      message('完成状态已保存并同步。');
      void Promise.resolve().then(()=>onWorkChange?.()).catch(()=>{});
    }catch(error){
      if(!alive)return;
      busy=false;
      if(/^(22|23|42|P0|40001)/.test(error.code||'')){
        workCommand=null;await refresh();message(error.code==='40001'?'任务已被另一人修改，请核对最新状态。':'状态未保存，请核对权限后重试。');
      }else message('保存尚未确认，请重试同一笔完成状态。');
    }finally{if(alive)controls();}
  }
  root.addEventListener('change',async event=>{
    const workCheck=event.target.closest('[data-ps-work-done],[data-ps-marketing-done]');
    if(workCheck){
      if(busy||!approveLeave()){render(true);return;}
      close();
      if(workCheck.dataset.psWorkDone){
        const task=workTasks.find(t=>t.id===workCheck.dataset.psWorkDone);if(!task)return;
        workCommand={method:'sculpy_os_update_task',args:{p_request_id:win.crypto.randomUUID(),p_task_id:task.id,p_expected_version:task.edit_version,p_action:workCheck.checked?'complete':'reopen',p_due_on:null,p_confirmed:true}};
      }else workCommand={method:'sculpy_marketing_set_check',args:{p_post_id:Number(workCheck.dataset.psMarketingDone),p_task_index:50,p_checked:workCheck.checked}};
      await saveWorkCommand();return;
    }
    const check=event.target.closest('[data-ps-done]');if(!check||busy)return;
    if(pending){render(true);message('请先重试当前未确认的保存。');return;}
    const item=items.find(x=>x.id===check.dataset.psDone);if(!item)return;
    busy=true;controls();
    try{await persist({id:item.id,version:item.version,data:{completed:check.checked}});if(!alive)return;busy=false;await refresh();if(!loadFailed)message('完成状态已保存。');}
    catch(error){if(alive){busy=false;render(true);message(error.message);if(error.conflict)void refresh();}}
  });
  const focus=()=>{if(!busy&&!dirty&&!pending&&!workCommand&&!root.classList.contains('workspace-page-inactive'))void refresh();};
  win.addEventListener('focus',focus);
  // Small bounded reads keep two open accounts in sync; no personal data in localStorage.
  const timer=win.setInterval(()=>{if(!doc.hidden&&!root.classList.contains('workspace-page-inactive'))focus();},30000);
  render();void refresh();
  return {
    canLeave:()=>!busy&&!dirty&&!pending&&!workCommand&&comments.canLeave(),
    refresh,
    closeCalendar,
    openReminder,
    destroy(){
      alive=false;
      comments.destroy();
      loadVersion++;
      win.clearInterval(timer);
      win.removeEventListener('focus',focus);
      doc.removeEventListener('pointerdown',dismissPicker);
    },
  };
}
import {holidayContentPlan} from './marketing-plan.js?v=marketing-pages-20261118';
