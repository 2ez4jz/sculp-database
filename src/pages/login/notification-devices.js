export function mountNotificationDevices({anchor,supabase,profile}) {
  if(!profile?.active || profile.username!=='sculp_jz' || profile.role!=='operations')return;
  const doc=anchor.ownerDocument;
  const panel=doc.createElement('details');
  panel.dataset.notificationDevices='';
  panel.innerHTML=`<summary>通知设备</summary><div class="notification-card">
    <div class="notification-actions"><button type="button" class="auth-secondary" data-refresh-devices>刷新</button></div>
    <p role="status"></p><div data-devices></div>
    <form data-system-push>
      <h3>发送系统通知</h3>
      <label>收件人<select name="recipient" required><option value="jz">JZ</option><option value="miranda">Miranda</option><option value="both">JZ 和 Miranda</option></select></label>
      <label>标题<input name="title" maxlength="100" value="SCULP OS 系统通知" required></label>
      <label>正文<textarea name="body" maxlength="400" rows="3" required></textarea></label>
      <p class="auth-muted">标题和正文可能显示在设备锁屏。</p>
      <button class="auth-primary" type="submit">发送推送</button>
      <p role="status" data-push-status></p>
    </form></div>`;
  anchor.after(panel);
  const refreshButton=panel.querySelector('button'),status=panel.querySelector('[role=status]'),list=panel.querySelector('[data-devices]');
  let version=0;
  async function refresh(){
    const mine=++version;
    refreshButton.disabled=true;status.textContent='正在读取设备…';list.replaceChildren();
    try{
      const {data,error}=await supabase.rpc('sculpy_jz_notification_devices');
      if(error||!Array.isArray(data?.devices))throw Error('Device list unavailable');
      if(!panel.isConnected||mine!==version)return;
      const rows=data.devices;
      status.textContent=(data.systemEnabled?'':'全局推送已暂停。')+(rows.length?`共 ${rows.length} 条有效设备订阅`:'当前没有有效设备订阅。');
      for(const device of rows){
        const article=doc.createElement('article'),body=doc.createElement('div');
        article.className='notification-history-row';
        const title=doc.createElement('strong'),meta=doc.createElement('small'),types=doc.createElement('span');
        title.textContent=[device.name||device.account,device.platform,device.browser].filter(Boolean).join(' · ');
        meta.textContent=`设备订阅 #${device.ref}`;
        const active=data.systemEnabled&&device.enabled;
        const categories=[[device.newEnquiry,'新询盘'],[device.overdue,'逾期询盘'],[device.marketing,'营销 @'],[device.itinerary,'行程提醒']].filter(([enabled])=>enabled).map(([,name])=>name);
        types.textContent=!data.systemEnabled?'全局推送暂停':!device.enabled?'账号工作通知已关闭':categories.length?'已开启 · '+categories.join('、'):'暂无已开启的业务通知';
        if(active&&device.itinerary===false)types.textContent+=' · 行程提醒已关闭';
        body.append(title,meta,types);article.append(body);list.append(article);
      }
    }catch{if(panel.isConnected&&mine===version)status.textContent='无法读取设备，请刷新重试。';}
    finally{if(mine===version)refreshButton.disabled=false;}
  }
  const form=panel.querySelector('[data-system-push]');
  const pushStatus=panel.querySelector('[data-push-status]');
  const submit=form.querySelector('[type=submit]');
  let pendingPush;
  form.addEventListener('input',()=>{pendingPush=null;});
  form.onsubmit=async event=>{
    event.preventDefault();
    if(submit.disabled)return;
    const fields=new doc.defaultView.FormData(form);
    const p_target=fields.get('recipient'),p_title=fields.get('title').trim(),p_body=fields.get('body').trim();
    if(!p_title||!p_body){pushStatus.textContent='请填写标题和正文。';return;}
    pendingPush??=doc.defaultView.crypto.randomUUID();
    const args={p_request:pendingPush,p_target,p_title,p_body};
    for(const field of form.elements)field.disabled=true;
    pushStatus.textContent='正在提交…';
    try{
      const {data,error}=await supabase.rpc('sculpy_send_system_push',args);
      if(error||!data)throw Error('Unable to confirm push');
      const names=p_target==='both'?['JZ','Miranda']:p_target==='jz'?['JZ']:['Miranda'];
      pushStatus.textContent=names.map(name=>{
        const count=data['sculp_'+name.toLowerCase()]??0;
        return count?`${name}：已提交到 ${count} 台设备`:`${name}：无可用的推送设备`;
      }).join(' · ');
      pendingPush=null;
      if(Object.keys(data).length)form.elements.body.value='';
    }catch{pushStatus.textContent='发送结果未确认，可点击发送重试。';}
    finally{for(const field of form.elements)field.disabled=false;}
  };
  refreshButton.onclick=refresh;
  panel.ontoggle=()=>{
    if(panel.open)void refresh();
    else{version++;list.replaceChildren();status.textContent='';refreshButton.disabled=false;}
  };
}
