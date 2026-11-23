// The composer stays mounted while the selected day's thread refreshes.
export function mountAgendaComments({root,supabase,profile,zoneForInstant,selectDay,readPages}) {
  const doc=root.ownerDocument;
  const peer=profile.username==='sculp_jz'?'Miranda':'JZ';
  const self=peer==='JZ'?'Miranda':'JZ';
  root.innerHTML=`<h4>当日留言</h4>
    <div data-mentions></div><div data-thread></div>
    <form data-compose><textarea rows="2" maxlength="2000" aria-label="当日留言" placeholder="给对方留句话…" required></textarea>
      <div class="ps-comment-actions"><button type="button" data-mention>@${peer}</button>
      <button type="submit" class="auth-primary">发送留言</button></div>
    </form><p role="status" class="ps-status" data-feedback></p>`;
  const $=s=>root.querySelector(s);
  const form=$('form'),input=$('textarea'),mention=$('[data-mention]'),send=$('[type=submit]');
  const thread=$('[data-thread]'),notices=$('[data-mentions]'),feedback=$('[data-feedback]');
  const table=()=>supabase.from('miranda_day_comments');
  const fields='id,agenda_day,body,author_id,mentioned_user_id,created_at,read_at';
  let day='',generation=0,alive=true,sending=false,pending=null;
  let lastRows='',lastNotice='';
  function setDay(next){
    if(day===next)return;
    day=next;generation++;lastRows=lastNotice='';
    form.reset();feedback.textContent='';thread.textContent='正在读取留言…';notices.replaceChildren();
  }
  function button(label,act){
    const el=doc.createElement('button');
    el.type='button';el.textContent=label;el.addEventListener('click',act);
    return el;
  }
  async function acknowledge(row,el){
    el.disabled=true;
    try{
      const {error}=await table().update({read_at:new Date().toISOString()}).eq('id',row.id).eq('mentioned_user_id',profile.id).is('read_at',null);
      if(error)throw error;
      await refresh();
    }catch{if(alive&&day===row.agenda_day){el.disabled=false;feedback.textContent='已读状态未确认，请重试。';}}
  }
  function renderRows(rows){
    const key=zoneForInstant(new Date())+JSON.stringify(rows);
    if(lastRows===key)return;
    lastRows=key;
    if(!rows.length){thread.textContent='当天还没有留言。';return;}
    const fragment=doc.createDocumentFragment();
    for(const row of rows){
      const entry=doc.createElement('article'),header=doc.createElement('header'),author=doc.createElement('strong');
      const time=doc.createElement('time'),body=doc.createElement('p');
      entry.dataset.agendaComment=row.id;
      entry.tabIndex=-1;
      author.textContent=row.author_id===profile.id?self:peer;
      time.dateTime=row.created_at;
      time.textContent=new Date(row.created_at).toLocaleString('zh-CN',{timeZone:zoneForInstant(row.created_at),month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
      header.append(author,time);
      if(row.mentioned_user_id===profile.id&&!row.read_at){
        const ack=button('@我 · 标为已读',()=>acknowledge(row,ack));
        header.append(ack);
      }
      body.textContent=row.body;entry.append(header,body);fragment.append(entry);
    }
    thread.replaceChildren(fragment);
  }
  async function refresh(){
    if(!alive||!day)return;
    const snapshot=day,mine=++generation;
    const current=()=>alive&&mine===generation;
    const [rows,unread]=await Promise.allSettled([
      readPages(100,offset=>table().select(fields).eq('agenda_day',snapshot).order('created_at').order('id').range(offset,offset+99),current),
      table().select('id,agenda_day').eq('mentioned_user_id',profile.id).is('read_at',null).neq('agenda_day',snapshot).order('created_at').order('id').limit(1),
    ]);
    if(!current())return;
    if(rows.status==='fulfilled')renderRows(rows.value);
    else {lastRows='';thread.replaceChildren('当天留言读取失败。',button('重试',refresh));}
    if(unread.status!=='fulfilled'||unread.value.error){lastNotice='';notices.replaceChildren(button('重试读取 @我的留言',refresh));return;}
    const next=unread.value.data?.[0],key=next?.id||'none';
    if(lastNotice!==key){lastNotice=key;notices.replaceChildren();
      if(next)notices.append(button(`查看 ${next.agenda_day} @我的留言`,()=>selectDay(next.agenda_day)));
    }
  }
  mention.onclick=()=>{
    const start=input.selectionStart,end=input.selectionEnd;
    const tag=(start&&/[^\s]/u.test(input.value[start-1])?' ':'')+'@'+peer+' ';
    if(input.value.length-(end-start)+tag.length<=input.maxLength)input.setRangeText(tag,start,end,'end');
    input.focus();
  };
  function controls(){
    input.disabled=mention.disabled=Boolean(pending);
    send.disabled=sending;
    send.textContent=sending?'发送中…':pending?'重试发送':'发送留言';
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    if(sending||!day)return;
    const body=input.value.trim();
    if(!pending&&!body){feedback.textContent='请先填写留言。';input.focus();return;}
    pending??={id:doc.defaultView.crypto.randomUUID(),agenda_day:day,body};
    sending=true;controls();feedback.textContent='';
    try{
      const result=await table().insert(pending).select(fields).single();
      let row=result.data;
      if(result.error?.code==='23505'){
        const replay=await table().select(fields).eq('id',pending.id).single();
        if(replay.error)throw replay.error;
        row=replay.data;
      }else if(result.error)throw result.error;
      if(row?.id!==pending.id||row.author_id!==profile.id||row.agenda_day!==pending.agenda_day||row.body!==pending.body)throw Error('Unconfirmed comment');
      if(!alive)return;
      pending=null;input.value='';feedback.textContent='留言已发送。';
      await refresh();
    }catch(error){
      if(!alive)return;
      if(/^(22|42|23)/.test(error?.code||'')){
        pending=null;feedback.textContent=error.code==='22023'?'对方账号暂时无法被 @。可修改后再发。':'发送失败，请核对内容及账号权限后再发。';
      }else feedback.textContent='发送结果待确认，请点「重试发送」。';
    }finally{if(alive){sending=false;controls();}}
  };
  const hasDraft=()=>Boolean(input.value.trim());
  function canChangeDay(){
    if(pending||sending){feedback.textContent='请先确认当前留言的发送结果。';return false;}
    return !hasDraft()||doc.defaultView.confirm('切换日期并放弃未发送的留言？');
  }
  return {setDay,refresh,canChangeDay,canLeave:()=>!hasDraft()&&!pending&&!sending,destroy(){alive=false;generation++;}};
}
