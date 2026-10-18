export function mountWebsiteEnquiries({root,supabase}) {
  root.innerHTML = `<section class="cloud-orders" id="website-enquiries"><h3>官网询盘 · 待处理</h3><p class="cloud-note">官网提交会先进入这里，不会自动生成已成交订单。来源可以在确认客户后补充。</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><select data-filter aria-label="询盘状态"><option value="open">待处理和跟进中</option><option value="all">全部询盘</option><option value="won">已成交</option><option value="lost">未成交</option></select><button type="button" data-refresh>刷新询盘</button></div><p data-status role="status"></p><div data-list></div></section>`;
  const $=s=>root.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let alive=true;
  async function load(){
    $('[data-status]').textContent='正在读取真实询盘…';
    let q=supabase.from('website_enquiries').select('*').order('created_at',{ascending:false}).limit(150);
    const filter=$('[data-filter]').value;
    if(filter==='open')q=q.in('status',['pending','contacted','qualified']);
    if(filter==='won'||filter==='lost')q=q.eq('status',filter);
    const {data,error}=await q;
    if(!alive)return;
    if(error){$('[data-status]').textContent='读取失败：请确认管理员权限或重新登录。';return;}
    $('[data-status]').textContent=`共 ${data.length} 条（最多显示最新150条）`;
    $('[data-list]').innerHTML=data.map(lead=>`<article class="cloud-order" style="display:block;text-align:left;padding:14px;margin:10px 0">
      <strong>${esc(lead.name)} · ${esc(lead.service)}</strong>
      <p style="margin:6px 0">${esc(new Date(lead.created_at).toLocaleString('zh-CN',{timeZone:'America/Toronto'}))} · ${esc(lead.event_date||'日期待定')} · ${esc(lead.location)}</p>
      <p style="margin:6px 0"><a href="mailto:${encodeURIComponent(lead.email)}">${esc(lead.email)}</a> · ${esc(lead.contact||'无其他联系方式')} · ${esc(lead.artist||'')}</p>
      <details><summary>查看原始需求与来源记录</summary><p style="white-space:pre-wrap">${esc(lead.details)}</p><small>官网入口：${esc(lead.entry_channel)} · UTM: ${esc(lead.utm_source)} / ${esc(lead.utm_medium)} / ${esc(lead.utm_campaign)} · Referrer: ${esc(lead.landing_referrer)}</small></details>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0">
        <label>进展<select data-field="status"><option value="pending">待处理</option><option value="contacted">已联系</option><option value="qualified">跟进中</option><option value="won">已成交</option><option value="lost">未成交</option><option value="spam">无效询盘</option></select></label>
        <label>实际获客来源<select data-field="attribution_source"><option value="unknown">尚未确认</option><option value="instagram">Instagram</option><option value="google">Google 搜索</option><option value="xiaohongshu">小红书</option><option value="wechat">微信</option><option value="referral">熟人/客户推荐</option><option value="planner">婚礼策划师推荐</option><option value="direct">直接访问官网</option><option value="other">其他</option></select></label>
        <label>来源补充<input data-field="attribution_detail" maxlength="300" placeholder="推荐人、账号、活动名称"></label>
        <label>对应正式订单 UUID<input data-field="booking_id" placeholder="成交后可关联订单 ID"></label>
      </div>
      <label>跟进记录<textarea data-field="notes" maxlength="4000" rows="2" style="width:100%" placeholder="什么时候回复、报价、未成交原因"></textarea></label>
      <div style="display:flex;gap:10px;align-items:center"><button type="button" data-save>保存进展</button><span data-result role="status"></span></div>
    </article>`).join('');
    const cards=[...root.querySelectorAll('article')];
    cards.forEach((card,i)=>{
      const lead=data[i],get=k=>card.querySelector('[data-field="'+k+'"]');
      for(const k of ['status','attribution_source','attribution_detail','notes','booking_id'])get(k).value=lead[k]??'';
      card.querySelector('[data-save]').onclick=async()=>{
        const button=card.querySelector('[data-save]'),msg=card.querySelector('[data-result]');
        const patch={status:get('status').value,attribution_source:get('attribution_source').value,attribution_detail:get('attribution_detail').value.trim(),notes:get('notes').value.trim(),booking_id:get('booking_id').value.trim()||null,updated_at:new Date().toISOString()};
        if(patch.status==='won'&&!lead.converted_at)patch.converted_at=new Date().toISOString();
        if(patch.status!=='won')patch.converted_at=null;
        button.disabled=true;msg.textContent='保存中…';
        const {error}=await supabase.from('website_enquiries').update(patch).eq('id',lead.id).select('id').single();
        msg.textContent=error?'保存失败，请检查订单 ID 和权限':'已保存';
        button.disabled=false;
        if(!error)setTimeout(()=>{if(alive)void load()},450);
      };
    });
  }
  $('[data-refresh]').onclick=()=>void load();
  $('[data-filter]').onchange=()=>void load();
  void load();
  return {destroy(){alive=false;}};
}
