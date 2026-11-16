import {mountClientEditor} from './os-client-editor.js?v=os32-20261116';
import {esc} from './wedding-dashboard.js';

const date = value => new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit',
}).format(new Date(value));
const statusNames = {open:'待完成',done:'已完成',dismissed:'已取消',inquiry:'待确认',confirmed:'已确认',completed:'已完成',cancelled:'已取消'};
const missing = value => esc(value || '未填写');

// Authenticated business pages only. Task writes require confirmation and a
// server revision; an uncertain response retains the exact command for retry.
export function mountOsOperations({taskRoot,clientRoot,supabase,onOrder,onNewTask,onSaved,onClientSaved,onAssignees}) {
  let alive=true,taskVersion=0,clientVersion=0,offset=0,clientOffset=0;
  let tasks=[],selected=null,pending=null,saving=false,pendingMethod=null,clientEditor=null,assignees=[];
  const canLeave=()=>!pending&&!saving&&(clientEditor?.canLeave()??true);
  taskRoot.innerHTML=`<div class="os-heading"><h4>跟进任务</h4><label>查看范围<select data-task-scope><option value="team">团队待办</option><option value="mine">我的待办</option></select></label><label>任务状态<select data-task-filter><option value="open">待完成</option><option value="done">已完成</option><option value="dismissed">已取消</option></select></label></div>
    <p role="status" data-task-status></p><div data-task-list></div>
    <div class="os-shortcuts"><button type="button" data-task-prev>上一页任务</button><button type="button" data-task-next>下一页任务</button></div>
    <section class="os-card" data-task-editor hidden><h4 data-task-title></h4><p data-task-context></p>
      <form data-task-update><label>处理方式<select name="action"></select></label>
      <label data-task-assignee hidden>新负责人<select name="assignee"></select></label>
      <label data-task-date>新的截止日期（多伦多）<input type="date" name="dueOn"></label>
      <label><input type="checkbox" name="confirmed" required>已核对任务和本次修改</label>
      <div class="os-shortcuts"><button type="submit">确认修改任务</button><button type="button" data-task-close>关闭</button></div>
      <p role="status" data-task-result></p></form></section>`;
  const $=s=>taskRoot.querySelector(s),c$=s=>clientRoot.querySelector(s);
  const form=$('[data-task-update]'),submit=form.querySelector('[type=submit]');
  const showDate=()=>{
    const reschedule=form.elements.action.value==='reschedule';
    $('[data-task-date]').hidden=!reschedule;form.elements.dueOn.required=reschedule;
    $('[data-task-assignee]').hidden=form.elements.action.value!=='reassign';
  };
  form.elements.action.onchange=showDate;
  function lockEditor(locked){
    for(const el of form.elements)if(el!==submit)el.disabled=locked;
    $('[data-task-filter]').disabled=locked;$('[data-task-scope]').disabled=locked;
    $('[data-task-prev]').disabled=locked||offset===0;
    $('[data-task-next]').disabled=locked||offset+20>=Number(taskRoot.dataset.total||0);
  }
  function openEditor(id){
    if(!canLeave())return;
    selected=tasks.find(t=>t.id===id);if(!selected)return;
    form.reset();$('[data-task-result]').textContent='';submit.textContent='确认修改任务';
    $('[data-task-title]').textContent=selected.reason;
    $('[data-task-context]').textContent=`${date(selected.due_at)} · ${statusNames[selected.status]} · ${selected.assignee||'未分配'}`;
    form.elements.action.innerHTML=selected.status==='open'?'<option value="complete">标记完成</option><option value="reschedule">修改截止日期</option><option value="cancel">取消任务</option>':'<option value="reopen">重新打开任务</option>';
    if(assignees.length)form.elements.action.insertAdjacentHTML('beforeend','<option value="reassign">改派负责人</option>');
    form.elements.assignee.innerHTML=assignees.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');form.elements.assignee.value=selected.assigned_to||'';
    form.elements.dueOn.value=date(selected.due_at);showDate();lockEditor(false);
    $('[data-task-editor]').hidden=false;$('[data-task-editor]').scrollIntoView({block:'start'});
  }
  async function refreshTasks(){
    if(!canLeave()||!alive)return;
    const mine=++taskVersion,status=$('[data-task-filter]').value;
    tasks=[];$('[data-task-list]').replaceChildren();$('[data-task-status]').textContent='正在读取任务…';
    $('[data-task-prev]').disabled=true;$('[data-task-next]').disabled=true;
    try{
      const {data,error}=await supabase.rpc('sculpy_os_tasks_v32',{p_status:status,p_offset:offset,p_scope:$('[data-task-scope]').value});
      if(!alive||mine!==taskVersion)return;
      if(error||!Array.isArray(data?.tasks))throw Error('unavailable');
      tasks=data.tasks;taskRoot.dataset.total=String(data.total);
      $('[data-task-status]').textContent=`${statusNames[status]}共 ${data.total} 项 · 每页 20 项`;
      $('[data-task-list]').innerHTML=tasks.map(t=>`<article class="os-list-row"><strong>${esc(t.reason)}</strong><span>${esc(date(t.due_at))} · ${esc(t.assignee||'未分配')}${t.client?' · '+esc(t.client):''}${t.order_number?' · '+esc(t.order_number):''}</span><div class="os-shortcuts"><button type="button" data-task-edit="${esc(t.id)}">处理任务</button>${t.booking_id?`<button type="button" data-task-order="${esc(t.booking_id)}">查看关联订单</button>`:''}</div></article>`).join('')||'<p class="os-empty">当前状态下没有任务。</p>';
      lockEditor(false);
    }catch{
      if(alive&&mine===taskVersion)$('[data-task-status]').textContent='任务列表暂不可用，请刷新重试或检查新版接口是否已部署。';
    }
  }
  $('[data-task-scope]').onchange=()=>{if(!canLeave())return;offset=0;selected=null;$('[data-task-editor]').hidden=true;void refreshTasks();};
  $('[data-task-filter]').onchange=()=>{if(!canLeave())return;offset=0;selected=null;$('[data-task-editor]').hidden=true;void refreshTasks();};
  $('[data-task-prev]').onclick=()=>{if(!canLeave())return;offset=Math.max(0,offset-20);$('[data-task-editor]').hidden=true;void refreshTasks();};
  $('[data-task-next]').onclick=()=>{if(!canLeave())return;offset+=20;$('[data-task-editor]').hidden=true;void refreshTasks();};
  $('[data-task-close]').onclick=()=>{if(canLeave())$('[data-task-editor]').hidden=true;};
  taskRoot.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!canLeave())return;
    if(button.dataset.taskEdit)openEditor(button.dataset.taskEdit);
    if(button.dataset.taskOrder)onOrder(button.dataset.taskOrder);
  });
  form.onsubmit=async event=>{
    event.preventDefault();if(saving||!alive||!selected)return;
    if(!pending){
      if(!form.reportValidity())return;
      pending={p_request_id:crypto.randomUUID(),p_task_id:selected.id,p_expected_version:selected.edit_version,p_action:form.elements.action.value,
        p_due_on:form.elements.action.value==='reschedule'?form.elements.dueOn.value:null,p_confirmed:true};
      pendingMethod='sculpy_os_update_task';
      if(form.elements.action.value==='reassign'){pendingMethod='sculpy_os_reassign_task';delete pending.p_action;delete pending.p_due_on;pending.p_assigned_to=form.elements.assignee.value;}
      taskVersion++;
    }
    saving=true;lockEditor(true);submit.disabled=true;$('[data-task-result]').textContent='正在保存…';
    let acknowledged=false,conflict=false;
    try{
      const {data,error}=await supabase.rpc(pendingMethod,pending);
      if(!alive)return;
      if(error){
        if(['22023','42501','40001','23505','PGRST202','42883'].includes(error.code)){
          conflict=error.code==='40001';pending=null;lockEditor(false);
          $('[data-task-result]').textContent=conflict?'任务已被其他人更新，请重新选择任务后核对。':error.code==='42501'?'权限已变化，请重新登录后核对。':['PGRST202','42883'].includes(error.code)?'新版任务接口尚未部署，请稍后重试。':'修改未保存，请核对任务及截止日期。';
          if(conflict)selected=null;
          return;
        }
        throw Error('unacknowledged');
      }
      if(data?.id!==pending.p_task_id||data?.requestId!==pending.p_request_id)throw Error('unacknowledged');
      acknowledged=true;pending=null;selected=null;lockEditor(false);form.reset();
      $('[data-task-result]').textContent='任务已保存。';$('[data-task-editor]').hidden=true;
    }catch{
      if(alive){$('[data-task-result]').textContent='未收到保存确认，请重试同一笔修改。';submit.textContent='重试同一笔修改';}
    }finally{
      saving=false;if(alive)submit.disabled=false;
      // Refresh is never part of the write acknowledgment. A failed refresh
      // cannot re-send an already successful mutation.
      if(alive&&(acknowledged||conflict)){
        await refreshTasks();
        if(acknowledged){$('[data-task-status]').textContent='任务已保存。'+$('[data-task-status]').textContent;try{await onSaved();}catch{/* show independent dashboard error */}}
      }
    }
  };
  async function openClient(id,{keepOffset=false}={}){
    if(!canLeave()||!alive)return;
    if(!keepOffset)clientOffset=0;
    clientEditor?.destroy();clientEditor=null;const mine=++clientVersion;
    clientRoot.hidden=false;clientRoot.textContent='正在读取客户档案…';clientRoot.scrollIntoView({block:'start'});
    try{
      const {data,error}=await supabase.rpc('sculpy_os_client_detail_v32',{p_client_id:id,p_offset:clientOffset});
      if(!alive||mine!==clientVersion)return;
      if(error||data?.client?.id!==id||!Array.isArray(data.bookings))throw Error('unavailable');
      const c=data.client,p=data.contact||{};
      clientRoot.innerHTML=`<div class="os-heading"><h4>${esc(c.display_name)} · 客户档案</h4><button type="button" data-client-close>关闭档案</button></div>
        <dl class="os-client-fields">${[['称呼',c.preferred_name],['客户来源',c.referral_source],['城市',c.city],['语言',c.preferred_language],['婚礼日期',c.wedding_date],['标签',(c.tags||[]).join('、')],['客户状态',{lead:'潜在客户',active:'活跃客户',past:'历史客户',archived:'已归档'}[c.lifecycle_status]||c.lifecycle_status],['电话',p.phone],['邮箱',p.email],['微信',p.wechat],['Instagram',p.instagram]].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${missing(value)}</dd></div>`).join('')}</dl>
        <p class="os-preserve-lines">内部备注：${missing(p.internal_notes)}</p><button type="button" data-client-task>为此客户添加任务</button>
        <div data-client-edit-root></div><h4>历史与未来订单 · 共 ${esc(data.total)} 笔</h4><div>${data.bookings.map(b=>`<button type="button" class="os-list-row" data-client-order="${esc(b.id)}"><strong>${esc(b.order_number)} · ${esc(b.service||'服务待补充')}</strong><span>${esc(date(b.starts_at))} · ${esc(statusNames[b.status]||b.status)}</span></button>`).join('')||'<p class="os-empty">暂无关联订单。</p>'}</div>
        <div class="os-shortcuts"><button type="button" data-client-prev ${clientOffset===0?'disabled':''}>上一页订单</button><button type="button" data-client-next ${clientOffset+20>=data.total?'disabled':''}>下一页订单</button></div>`;
      clientEditor=mountClientEditor({root:c$('[data-client-edit-root]'),supabase,detail:data,onSaved:async()=>{clientEditor?.destroy();clientEditor=null;await openClient(id,{keepOffset:true});await onClientSaved?.();}});
      c$('[data-client-task]').onclick=()=>{if(canLeave())onNewTask({clientId:id,label:c.display_name});};
      c$('[data-client-close]').onclick=()=>{if(canLeave()){clientVersion++;clientEditor?.destroy();clientEditor=null;clientRoot.hidden=true;}};
      c$('[data-client-prev]').onclick=()=>{if(!canLeave())return;clientOffset=Math.max(0,clientOffset-20);void openClient(id,{keepOffset:true});};
      c$('[data-client-next]').onclick=()=>{if(!canLeave())return;clientOffset+=20;void openClient(id,{keepOffset:true});};
    }catch{if(alive&&mine===clientVersion)clientRoot.textContent='客户档案暂不可用。请刷新列表后重新选择，或检查权限及新版接口。';}
  }
  clientRoot.addEventListener('click',event=>{const button=event.target.closest('[data-client-order]');if(button&&canLeave())onOrder(button.dataset.clientOrder);});
  async function loadContext(){try{const {data,error}=await supabase.rpc('sculpy_os_task_context',{});if(!alive)return;if(error||!Array.isArray(data?.assignees))throw Error('unavailable');assignees=data.assignees;onAssignees?.(data);}catch{if(alive)onAssignees?.(null);}}
  void loadContext();
  return {canLeave,refreshTasks,openClient,destroy(){alive=false;taskVersion++;clientVersion++;clientEditor?.destroy();}};
}
