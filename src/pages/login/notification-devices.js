export function mountNotificationDevices({anchor,supabase,profile}) {
  if(!profile?.active || profile.username!=='sculp_jz' || profile.role!=='operations')return;
  const doc=anchor.ownerDocument;
  const panel=doc.createElement('details');
  panel.dataset.notificationDevices='';
  panel.innerHTML=`<summary>通知设备</summary><div class="notification-card">
    <div class="notification-actions"><button type="button" class="auth-secondary" data-refresh-devices>刷新</button></div>
    <p role="status"></p><div data-devices></div></div>`;
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
  refreshButton.onclick=refresh;
  panel.ontoggle=()=>{
    if(panel.open)void refresh();
    else{version++;list.replaceChildren();status.textContent='';refreshButton.disabled=false;}
  };
}
