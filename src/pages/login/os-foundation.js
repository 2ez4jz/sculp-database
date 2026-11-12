import {esc, money} from './wedding-dashboard.js';

export const osNavigation = [
  ['dashboard', 'Dashboard｜工作台', '[data-os-home]'],
  ['crm', 'CRM｜客户与询盘', '[data-os-clients]'],
  ['orders', 'Orders｜订单管理', '[data-orders-section]'],
  ['calendar', 'Calendar｜日程与任务', '[data-os-calendar]'],
  ['communications', 'Communications｜沟通中心', '[data-gmail-center]'],
  ['finance', 'Finance｜财务中心', '.w23-dashboard'],
  ['marketing', 'Marketing｜营销中心', '[data-os-marketing]'],
  ['ai', 'AI Insights｜AI 分析', '[data-global]'],
  ['settings', 'Settings｜系统设置', '#workspace-settings'],
];
const localDate = value => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));
const states = {inquiry:'待确认',confirmed:'已确认',pending:'待处理',contacted:'已联系',qualified:'跟进中',quoted:'已报价'};
const empty = text => `<p class="os-empty">${esc(text)}</p>`;
const metric = (label, value, note='') => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd><small>${esc(note)}</small></div>`;

// All data enters through authenticated, role-checked RPCs. No Demo imports/fallback.
export function mountOsFoundation({root, supabase, profile, onOrder, onLead, onNewOrder, onClientEmails}) {
  let alive=true, overviewVersion=0, clientsVersion=0, offset=0, overview=null;
  const pendingWrites=new Set();
  const canLeave=()=>pendingWrites.size===0;
  root.innerHTML=`<section class="os-home" data-os-home aria-label="日常运营工作台">
    <div class="os-heading"><div><span class="auth-eyebrow">SCULP OS · V3.0 PHASE 1</span><h3>今日工作台</h3><p class="cloud-note">先处理需要你关注的事。所有数据按当前账户权限读取。</p></div><button type="button" data-os-refresh>刷新工作台</button></div>
    <p role="status" data-os-status>正在读取工作台…</p><dl class="os-metrics" data-os-metrics></dl>
    <div class="os-shortcuts" aria-label="快捷操作"><button type="button" data-os-new-order>新建订单</button><button type="button" data-os-new-client>新增客户</button><button type="button" data-os-leads>查看询盘</button><button type="button" data-os-new-task>添加任务</button><button type="button" data-os-schedule>查看日程</button></div>
    <div class="os-grid"><section class="os-card"><h4>今日与逾期待办</h4><div data-os-today></div></section><section class="os-card"><h4>需要跟进的客户</h4><div data-os-followups></div></section><section class="os-card"><h4>近期订单与预约</h4><div data-os-upcoming></div></section><section class="os-card"><h4>系统与通知</h4><p>通知记录与本机授权请到 <button type="button" data-os-settings>系统设置</button> 查看。</p><p class="cloud-note">Gmail 需在设置中完成授权；外部日历与营销平台尚未接入。任务不会自动发送推送。</p></section></div>
  </section>
  <section class="cloud-orders" data-os-clients><h3>客户档案</h3><p class="cloud-note">同一客户可以有多笔订单。新增前请先搜索；姓名相同不代表同一个人。</p>
    <form data-os-client-search><label>搜索客户<input name="query" maxlength="160" placeholder="客户姓名"></label><button>搜索客户</button></form>
    <details data-os-client-create><summary>新增客户</summary><form data-os-client-form><label>客户姓名<input name="clientName" required maxlength="160"></label><label>客户来源<input name="source" maxlength="100"></label><label><input name="confirmed" type="checkbox" required>已搜索并核对客户资料</label><button>确认新增客户</button><p role="status" data-os-write-result></p></form></details>
    <p role="status" data-os-clients-status></p><div data-os-client-list></div><div class="os-shortcuts"><button type="button" data-os-client-prev>上一页客户</button><button type="button" data-os-client-next>下一页客户</button></div>
  </section>
  <section class="cloud-orders" data-os-calendar><h3>日程与任务</h3><p class="cloud-note">近期预约读取订单服务日期；尚未同步 Google / Outlook 日历。这里只展示最近 10 笔预约与最早 20 项未完成任务。</p><div data-os-calendar-list></div>
    <details data-os-task-create><summary>添加任务</summary><form data-os-task-form><label>任务内容<input name="title" required maxlength="300"></label><label>截止日期（多伦多）<input name="dueOn" type="date" required></label><input name="bookingId" type="hidden"><input name="clientId" type="hidden"><p data-os-task-link class="cloud-note">未关联客户或订单 · 分配给当前账户</p><label><input name="confirmed" type="checkbox" required>已核对内容及截止日期</label><button>确认添加任务</button><p role="status" data-os-write-result></p></form></details>
    <div data-os-tasks></div><p class="cloud-note">本阶段提供任务创建和查看；状态编辑、改期和重复任务留待下一阶段。</p>
  </section>
  <section class="cloud-orders" data-os-marketing hidden><h3>营销中心</h3><p>尚未接入 Instagram / 小红书的素材、审核、排期及发布流程。</p><p class="cloud-note">当前入口仅说明开发范围，不会自动发布或发送消息。</p></section>`;
  const $=s=>root.querySelector(s);
  const scroll=s=>$(s)?.scrollIntoView({block:'start'});
  function openTask({bookingId='',clientId='',label='未关联客户或订单'}={}) {
    if(!canLeave())return;
    const form=$('[data-os-task-form]');
    form.elements.bookingId.value=bookingId;form.elements.clientId.value=clientId;
    form.elements.confirmed.checked=false;
    $('[data-os-task-link]').textContent=label+' · 分配给当前账户';
    $('[data-os-task-create]').open=true;scroll('[data-os-task-create]');form.elements.title.focus();
  }
  $('[data-os-refresh]').onclick=()=>void refresh();
  $('[data-os-new-order]').onclick=onNewOrder;
  $('[data-os-new-client]').onclick=()=>{$('[data-os-client-create]').open=true;scroll('[data-os-clients]');$('[name=clientName]').focus();};
  $('[data-os-new-task]').onclick=()=>openTask();
  $('[data-os-schedule]').onclick=()=>scroll('[data-os-calendar]');
  $('[data-os-leads]').onclick=()=>document.querySelector('#website-enquiries')?.scrollIntoView({block:'start'});
  const leadsShortcut=document.createElement('button');leadsShortcut.type='button';leadsShortcut.textContent='查看客户询盘';leadsShortcut.onclick=$('[data-os-leads]').onclick;
  $('[data-os-clients] h3').after(leadsShortcut);
  $('[data-os-settings]').onclick=()=>document.querySelector('#workspace-settings')?.click();
  root.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.osOrder)onOrder(b.dataset.osOrder);
    if(b.dataset.osLead)onLead(b.dataset.osLead);
    if(b.dataset.osClientEmails){onClientEmails?.(b.dataset.osClientEmails);return;}
    if(b.dataset.osClientTask)openTask({clientId:b.dataset.osClientTask,label:b.dataset.label});
  });
  function renderOverview(data) {
    $('[data-os-metrics]').innerHTML=metric('待处理询盘',data.pendingEnquiries)+metric('今日待办',data.todayTasks,`另有 ${data.overdueTasks} 项逾期`)+metric('本周预约',data.weekBookings,'周一至周日 · 已确认订单')+metric('未完成订单',data.unfinishedOrders,'咨询中及已确认')+metric('待收款项',money(data.receivableCents),`已知 CAD 合同余额${data.receivableUnknown?` · ${data.receivableUnknown} 笔金额待核对`:''}`);
    const taskRow=t=>`<div class="os-list-row"><strong>${esc(t.reason)}</strong><span>${esc(localDate(t.due_at))} · ${localDate(t.due_at)<data.today?'已逾期':'待完成'}</span>${t.booking_id?`<button type="button" data-os-order="${esc(t.booking_id)}">查看关联订单</button>`:''}</div>`;
    const today=data.tasks.filter(t=>localDate(t.due_at)<=data.today);
    $('[data-os-today]').innerHTML=today.length?today.map(taskRow).join(''):empty('今日没有到期或逾期任务。');
    $('[data-os-tasks]').innerHTML=(data.tasks.length?data.tasks.map(taskRow).join(''):empty('暂无未完成任务。'))+`<p class="cloud-note">未完成共 ${esc(data.taskCount)} 项，显示最早 ${esc(data.tasks.length)} 项。</p>`;
    $('[data-os-followups]').innerHTML=(data.followups.length?data.followups.map(l=>`<button type="button" class="os-list-row" data-os-lead="${esc(l.id)}"><strong>${esc(l.name)}</strong><span>${esc(states[l.status]||l.status)} · ${l.last_contact_at?'上次联系 '+esc(localDate(l.last_contact_at)):'尚无联系记录'}</span></button>`).join(''):empty('暂无需要跟进的询盘。'))+`<small>跟进中共 ${esc(data.followupCount)} 条，优先显示最久未联系的 10 条。</small>`;
    const upcoming=data.upcoming.map(b=>`<button type="button" class="os-list-row" data-os-order="${esc(b.id)}"><strong>${esc(b.order_number)} · ${esc(b.client)}</strong><span>${esc(localDate(b.starts_at))} · ${esc(states[b.status]||b.status)}</span></button>`).join('')||empty('暂无即将开始的订单。');
    $('[data-os-upcoming]').innerHTML=upcoming;$('[data-os-calendar-list]').innerHTML=upcoming;
  }
  async function refresh() {
    const mine=++overviewVersion;
    $('[data-os-status]').textContent='正在读取工作台…';
    $('[data-os-metrics]').replaceChildren();
    for(const s of ['today','tasks','followups','upcoming','calendar-list'])$(`[data-os-${s}]`).textContent='正在读取…';
    try {
      const {data,error}=await supabase.rpc('sculpy_os_overview',{});
      if(!alive||mine!==overviewVersion)return;
      if(error||!data||!Array.isArray(data.tasks)||!Array.isArray(data.upcoming)||!Array.isArray(data.followups))throw Error('unavailable');
      overview=data;renderOverview(data);
      $('[data-os-status]').textContent='数据时间：'+new Date(data.asOf).toLocaleString('zh-CN',{timeZone:'America/Toronto'})+' · 多伦多';
    } catch {
      if(!alive||mine!==overviewVersion)return;
      overview=null;
      $('[data-os-status]').textContent='工作台数据暂不可用。请检查权限及 V3.0 基础接口是否已部署；原有订单和询盘仍可使用。';
      for(const s of ['today','tasks','followups','upcoming','calendar-list'])$(`[data-os-${s}]`).textContent='暂时无法读取，请重试。';
    }
  }
  async function loadClients() {
    const mine=++clientsVersion,query=$('[data-os-client-search] input').value.trim();
    $('[data-os-client-list]').replaceChildren();$('[data-os-clients-status]').textContent='正在读取客户…';
    $('[data-os-client-prev]').disabled=true;$('[data-os-client-next]').disabled=true;
    try {
      const {data,error}=await supabase.rpc('sculpy_os_clients',{p_query:query,p_offset:offset});
      if(!alive||mine!==clientsVersion)return;
      if(error||!Array.isArray(data?.clients))throw Error('unavailable');
      $('[data-os-clients-status]').textContent=`共 ${data.total} 位客户 · 每页 30 位`;
      $('[data-os-client-list]').innerHTML=data.clients.map(c=>`<article class="os-list-row"><strong>${esc(c.display_name)}</strong><span>${esc(c.referral_source||'来源待补充')} · ${esc(c.order_count)} 笔订单</span><button type="button" data-os-client-emails="${esc(c.id)}">查看客户邮件</button><button type="button" data-os-client-task="${esc(c.id)}" data-label="${esc(c.display_name)}">为客户添加任务</button></article>`).join('')||empty('暂无匹配客户。可先核对询盘，再新增客户档案。');
      $('[data-os-client-prev]').disabled=offset===0;$('[data-os-client-next]').disabled=offset+30>=data.total;
    } catch {if(alive&&mine===clientsVersion)$('[data-os-clients-status]').textContent='客户列表暂不可用，请检查权限及基础接口。';}
  }
  $('[data-os-client-search]').onsubmit=e=>{e.preventDefault();offset=0;void loadClients();};
  $('[data-os-client-search] input').oninput=()=>{clientsVersion++;$('[data-os-client-list]').replaceChildren();$('[data-os-clients-status]').textContent='搜索已变化，请重新搜索。';$('[data-os-client-prev]').disabled=true;$('[data-os-client-next]').disabled=true;};
  $('[data-os-client-prev]').onclick=()=>{offset=Math.max(0,offset-30);void loadClients();};
  $('[data-os-client-next]').onclick=()=>{offset+=30;void loadClients();};
  function bindCreate(selector,method,makePayload,onSaved) {
    const form=$(selector),result=form.querySelector('[data-os-write-result]'),button=form.querySelector('button');
    let pending=null,saving=false;
    form.onsubmit=async e=>{
      e.preventDefault();if(saving||!alive)return;
      if(!pending)pending=makePayload(form);
      saving=true;pendingWrites.add(form);button.disabled=true;
      [...form.elements].forEach(el=>{if(el!==button)el.disabled=true;});
      result.textContent='正在保存…';
      let acknowledged=false;
      try {
        const {data,error}=await supabase.rpc(method,pending);
        if(!alive)return;
        if(error){
          if(['22023','23505','42501','PGRST202','42883'].includes(error.code)){
            pending=null;pendingWrites.delete(form);[...form.elements].forEach(el=>el.disabled=false);
            result.textContent=error.code==='23505'?'存在同名客户或请求冲突，请核对已有资料。':error.code==='42501'?'权限已变化，请重新登录后核对。':['PGRST202','42883'].includes(error.code)?'基础接口尚未部署，请联系系统管理员。':'输入或关联记录无效，请核对。';
            return;
          }
          throw Error('unacknowledged');
        }
        if(!data?.id||data.id!==pending.p_id)throw Error('unacknowledged');
        acknowledged=true;pending=null;pendingWrites.delete(form);form.reset();
        [...form.elements].forEach(el=>el.disabled=false);button.textContent=method==='sculpy_os_create_task'?'确认添加任务':'确认新增客户';
        result.textContent='已保存。';
      } catch {if(alive){result.textContent='未收到保存确认，请重试同一笔操作。';button.textContent='重试同一笔操作';}}
      finally {saving=false;if(alive)button.disabled=false;}
      // Refresh failure must never turn an acknowledged write into a second write.
      if(acknowledged)await onSaved();
    };
  }
  bindCreate('[data-os-task-form]','sculpy_os_create_task',form=>({p_id:crypto.randomUUID(),p_title:form.elements.title.value.trim(),p_due_at:form.elements.dueOn.value+'T12:00:00Z',p_booking_id:form.elements.bookingId.value||null,p_client_id:form.elements.clientId.value||null,p_confirmed:true}),async()=>{ $('[data-os-task-link]').textContent='未关联客户或订单 · 分配给当前账户';await refresh();});
  bindCreate('[data-os-client-form]','sculpy_os_create_client',form=>({p_id:crypto.randomUUID(),p_name:form.elements.clientName.value.trim(),p_source:form.elements.source.value.trim(),p_confirmed:true}),loadClients);
  if(!['owner','operations'].includes(profile.role)){root.replaceChildren();return {canLeave:()=>true,refresh:async()=>{},openTask:()=>{},destroy(){alive=false;}};}
  void refresh();void loadClients();
  return {canLeave,refresh,refreshClients:loadClients,openTask,destroy(){alive=false;overviewVersion++;clientsVersion++;}};
}
