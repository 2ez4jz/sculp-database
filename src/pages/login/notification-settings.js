import {notificationApi,pushSupport,preparePush,currentDeviceId,enableDevice,disableDevice,localPushCleanup} from '../../pwa/notifications.js?v=25';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={pending:'待发送',sending:'发送中',accepted:'推送服务已接收',failed:'发送失败',cancelled:'已取消'};
export function mountNotificationSettings({root,supabase,profile,onOpen,onBack}){
 let alive=true,busy=false,state=null,registration=null,subscription=null;
 const support=pushSupport(),business=['owner','operations'].includes(profile.role);
 root.innerHTML=`<div class="notification-settings"><div class="notification-heading"><div><span class="auth-eyebrow">个人设置</span><h3>通知设置</h3><p>重要工作及时提醒，减少漏单和遗忘跟进。</p></div><button type="button" class="auth-secondary" data-back>返回工作台</button></div><section class="notification-card"><h4>这台设备</h4><p data-support>${esc(support.message)}</p><dl class="notification-status"><div><dt>浏览器权限</dt><dd data-permission>检查中</dd></div><div><dt>设备订阅</dt><dd data-device>检查中</dd></div></dl><div class="notification-actions"><button type="button" class="auth-primary" data-enable disabled>开启此设备推送</button><button type="button" class="auth-secondary" data-disable disabled>关闭此设备</button><button type="button" class="auth-secondary" data-test disabled>发送测试通知</button></div><p class="cloud-note">测试通知只发给你当前的设备。推送属于辅助提醒，送达时间可能受系统设置影响。</p></section><section class="notification-card"><h4>我的通知偏好</h4><form data-preferences><label class="notification-check"><input type="checkbox" name="enabled">接收工作通知</label>${business?'<label class="notification-check"><input type="checkbox" name="new_enquiry">新官网询盘</label><label class="notification-check"><input type="checkbox" name="overdue">待处理询盘超时提醒</label>':'<p class="cloud-note">仅接收本人有权限的工作通知。团队内部提醒将在第一阶段验收后开放。</p>'}<p class="cloud-note">取消“接收工作通知”并保存，会关闭此账户所有设备的推送。</p><button class="auth-primary" type="submit" disabled>保存通知偏好</button></form></section>${profile.role==='operations'?'<section class="notification-card"><h4>全局提醒规则</h4><form data-global><label class="notification-check"><input name="enabled" type="checkbox">启用业务推送服务</label><div class="notification-fields"><label>待处理超过（小时）<input type="number" min="1" max="168" name="overdueHours" required></label><label>重复提醒<select name="repeatHours"><option value="0">每条询盘仅提醒一次</option><option value="24">每 24 小时</option><option value="48">每 48 小时</option><option value="72">每 72 小时</option><option value="168">每 7 天</option></select></label></div><p class="cloud-note">未分配负责人的询盘提醒已开启通知的管理人员；已分配时仅提醒对应负责人。已处理或关闭后停止提醒。</p><button type="submit" class="auth-secondary" disabled>保存全局规则</button></form><p data-scheduler class="cloud-note"></p><details><summary>发送诊断</summary><div data-diagnostics></div></details></section>':''}<section class="notification-card"><div class="notification-history-heading"><h4>通知记录</h4><button type="button" class="auth-secondary" data-refresh>刷新</button></div><p class="cloud-note">“推送服务已接收”表示服务接受了请求；打开通知后会标记为已打开。</p><div data-history>正在读取…</div></section><p role="status" aria-live="polite" data-status></p></div>`;
 const $=s=>root.querySelector(s),prefs=$('[data-preferences]');
 function status(text){if(alive)$('[data-status]').textContent=text;}
 function controls(){
  const device=state?.devices?.find(d=>d.id===currentDeviceId(profile.id)),active=device?.active;
  const permission='Notification' in window?Notification.permission:'unsupported';
  $('[data-permission]').textContent=!('Notification' in window)?'不支持':({granted:'已允许',denied:'已拒绝',default:'尚未申请'}[Notification.permission]||'未知');
  $('[data-device]').textContent=active?(device.currentSession&&subscription?'已登记此设备':'需要重新连接'):'尚未登记或已关闭';
  if(permission==='denied')$('[data-support]').textContent='通知权限已关闭，请在系统或浏览器的网站设置中允许通知，再返回刷新状态。';
  $('[data-enable]').disabled=busy||!support.supported||!registration||!state?.publicKey||!state?.systemEnabled||permission==='denied';
  $('[data-disable]').disabled=busy||!active;$('[data-test]').disabled=busy||!active||!device.currentSession||!subscription||!state?.systemEnabled||permission!=='granted';
  root.querySelectorAll('form button').forEach(b=>b.disabled=busy||!state);
  root.querySelectorAll('form input,form select').forEach(el=>el.disabled=busy||!state);
  $('[data-refresh]').disabled=busy;
  $('[data-back]').disabled=busy;
 }
 async function history(){
  const h=await notificationApi(supabase,'history');if(!alive)return;
  $('[data-history]').innerHTML=h.items.length?h.items.map(n=>`<article class="notification-history-row"><div><strong>${esc(n.title)}</strong><small>${esc(new Date(n.created_at).toLocaleString('zh-CN',{timeZone:'America/Toronto'}))}</small><span>${n.read_at?'已打开':esc([...new Set(n.deliveries.map(d=>labels[d.status]||d.status))].join(' · ')||'已记录')}</span></div><button type="button" class="auth-secondary" data-open="${esc(n.id)}">查看</button></article>`).join(''):'<p class="cloud-note">暂无通知记录。</p>';
  root.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{if(busy)return;try{const target=await notificationApi(supabase,'open',{id:b.dataset.open});if(alive)await onOpen(target);}catch(e){status(e.message);}});
  if(profile.role==='operations'){
   const d=await notificationApi(supabase,'diagnostics');if(!alive)return;
   $('[data-diagnostics]').textContent=`队列：${Object.entries(d.queue).map(([k,v])=>`${labels[k]||k} ${v}`).join('、')||'暂无'}。${d.errors.length?'最近错误：'+d.errors.map(e=>e.code).join('、'):'暂无发送错误。'}`;
  }
 }
 async function refresh(){
  state=await notificationApi(supabase,'state');if(!alive)return;
  const p=state.preferences;for(const key of ['enabled','new_enquiry','overdue'])if(prefs.elements[key])prefs.elements[key].checked=p[key];
  if(profile.role==='operations'){
   const f=$('[data-global]');f.elements.enabled.checked=state.config.enabled;f.elements.overdueHours.value=state.config.overdueHours;f.elements.repeatHours.value=String(state.config.repeatHours);
   $('[data-scheduler]').textContent=`定时检查：${state.config.schedulerInstalled?'已配置':'尚未配置'}${state.config.lastTickAt?' · 最近运行 '+new Date(state.config.lastTickAt).toLocaleString('zh-CN',{timeZone:'America/Toronto'}):''}`;
  }
  if(!state.systemEnabled)status('业务推送服务当前暂停；你的偏好可以正常保存。');
  controls();await history();
 }
 async function run(task){if(busy)return;busy=true;controls();try{await task();}catch(e){status(e.name==='NotAllowedError'?'通知权限未开启，请在系统或浏览器设置中允许后重试。':e.message||'操作暂未完成，请稍后重试。');}finally{if(alive){busy=false;controls();}}}
 $('[data-back]').onclick=onBack;
 $('[data-enable]').onclick=()=>{
  if(busy)return;
  // Start subscribe synchronously while the click's user activation is live.
  const pending=enableDevice({registration,subscription,publicKey:state.publicKey,supabase,profile});
  void run(async()=>{subscription=await pending;await refresh();status('此设备已开启推送，可以发送一条测试通知。');});
 };
 $('[data-disable]').onclick=()=>void run(async()=>{await disableDevice(supabase,profile);subscription=null;await refresh();status('此设备推送已关闭。');});
 $('[data-test]').onclick=()=>void run(async()=>{await notificationApi(supabase,'test',{deviceId:currentDeviceId(profile.id)});await history();status('测试通知已排队。请将 Sculpy 切到后台，检查设备通知。');});
 prefs.onsubmit=e=>{e.preventDefault();const data={enabled:prefs.elements.enabled.checked,new_enquiry:business&&prefs.elements.new_enquiry.checked,overdue:business&&prefs.elements.overdue.checked};void run(async()=>{await notificationApi(supabase,'preferences',data);if(!data.enabled){await localPushCleanup();subscription=null;}await refresh();status('通知偏好已保存。');});};
 $('[data-global]')?.addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;void run(async()=>{await notificationApi(supabase,'global',{enabled:f.elements.enabled.checked,overdueHours:Number(f.elements.overdueHours.value),repeatHours:Number(f.elements.repeatHours.value)});await refresh();status('全局提醒规则已保存。');});});
 $('[data-refresh]').onclick=()=>void run(async()=>{if(!registration){registration=await preparePush();subscription=await registration?.pushManager.getSubscription();}await refresh();status('已刷新通知状态。');});
 void preparePush().then(async r=>{if(!alive)return;registration=r;subscription=await r?.pushManager.getSubscription();if(alive)controls();}).catch(e=>status(e.message));
 void run(refresh);
 return {canLeave:()=>!busy,destroy(){alive=false;}};
}
