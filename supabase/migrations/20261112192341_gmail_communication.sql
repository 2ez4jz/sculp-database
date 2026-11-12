-- Gmail foundation. No production installation, secrets, seed mail or scheduler activation.
begin;
create table sculpy_private.gmail_accounts (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 token_cipher text, active boolean not null default true, generation integer not null default 1,
 status text not null default 'connected', connected_by uuid references public.profiles(id),
 business_label text, ai_enabled boolean not null default false,
 cursor text, scan jsonb, last_sync_at timestamptz, next_sync_at timestamptz not null default now(),
 lease uuid, lease_until timestamptz, error_code text,
 rules jsonb not null default '{"newHours":2,"quoteHours":48,"secondDays":5}', updated_at timestamptz not null default now()
);
-- V1 has one studio mailbox; removing this index later permits multiple accounts.
create unique index gmail_one_active on sculpy_private.gmail_accounts(active) where active;
create table sculpy_private.gmail_oauth_states (
 hash text primary key, actor uuid not null references public.profiles(id), verifier_cipher text not null,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create table sculpy_private.gmail_messages (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references sculpy_private.gmail_accounts(id),
 gmail_id text not null, thread_id text not null, from_addresses jsonb not null, to_addresses jsonb not null,
 subject text not null, body text not null, snippet text not null, attachments jsonb not null default '[]',
 direction text not null check(direction in ('incoming','outgoing','unknown')), sent_at timestamptz not null,
 redacted boolean not null default false, unique(account_id,gmail_id)
);
create index gmail_thread_time on sculpy_private.gmail_messages(account_id,thread_id,sent_at);
create table sculpy_private.gmail_client_links (
 message_id uuid references sculpy_private.gmail_messages(id), client_id uuid references public.clients(id),
 primary key(message_id,client_id)
);
create table sculpy_private.gmail_order_links (
 message_id uuid references sculpy_private.gmail_messages(id), booking_id uuid references public.bookings(id),
 linked boolean not null default true, manual boolean not null default false, actor uuid references public.profiles(id),
 primary key(message_id,booking_id)
);
create table sculpy_private.gmail_sync_jobs (
 id uuid primary key default gen_random_uuid(), account_id uuid references sculpy_private.gmail_accounts(id),
 started_at timestamptz not null default now(), finished_at timestamptz, status text not null, code text,
 message_count integer not null default 0
);
create table sculpy_private.gmail_ai_results (
 message_id uuid references sculpy_private.gmail_messages(id), kind text check(kind in ('summary','reply')),
 content jsonb not null, created_by uuid references public.profiles(id), updated_at timestamptz not null default now(),
 primary key(message_id,kind)
);
create table sculpy_private.gmail_client_states (
 client_id uuid primary key references public.clients(id), state text not null check(state in ('active','paused','lost','confirmed')),
 updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table sculpy_private.gmail_followups (
 message_id uuid references sculpy_private.gmail_messages(id), rule text not null,
 reminder_id uuid references public.reminders(id), primary key(message_id,rule)
);
do $$declare t text;begin
 foreach t in array array['gmail_accounts','gmail_oauth_states','gmail_messages','gmail_client_links','gmail_order_links','gmail_sync_jobs','gmail_ai_results','gmail_client_states','gmail_followups'] loop
 execute format('alter table sculpy_private.%I enable row level security',t);
 execute format('revoke all on sculpy_private.%I from public,anon,authenticated',t);
 end loop;
end$$;

-- Service-only orchestration boundary. Never callable with a browser JWT.
create function sculpy_private.gmail_server(a text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare acct sculpy_private.gmail_accounts; st sculpy_private.gmail_oauth_states; v_msg jsonb; mid uuid;
 cid uuid; n integer; chosen uuid; rec record; actor uuid; ids uuid[]; bid uuid; cnt integer:=0;
begin
 if a='oauth_start' then
  actor:=(p->>'actor')::uuid;
  if not exists(select 1 from public.profiles where id=actor and active and role in ('owner','operations')) then raise exception 'denied';end if;
  delete from sculpy_private.gmail_oauth_states where gmail_oauth_states.actor=(p->>'actor')::uuid;
 elsif a='oauth_consume' then
  delete from sculpy_private.gmail_oauth_states where hash=p->>'hash' and expires_at>now() returning * into st;
  if st.hash is null or not exists(select 1 from public.profiles where id=st.actor and active and role in ('owner','operations')) then raise exception 'oauth_state';end if;
  return jsonb_build_object('actor',st.actor,'verifier',st.verifier_cipher);
 elsif a='connect' then
  if not exists(select 1 from public.profiles where id=(p->>'actor')::uuid and active and role in ('owner','operations')) then raise exception 'denied';end if;
  if exists(select 1 from sculpy_private.gmail_accounts where active and email<>p->>'email') then raise exception 'disconnect_first';end if;
  insert into sculpy_private.gmail_accounts(email,token_cipher,connected_by,business_label)
   values(p->>'email',p->>'cipher',(p->>'actor')::uuid,nullif(p->>'label',''))
   on conflict(email) do update set token_cipher=excluded.token_cipher,active=true,status='connected',generation=gmail_accounts.generation+1,
    connected_by=excluded.connected_by,business_label=excluded.business_label,cursor=null,scan=null,lease=null,error_code=null,next_sync_at=now(),updated_at=now();
  return jsonb_build_object('connected',true);
 elsif a='disconnect' then
  if not exists(select 1 from public.profiles where id=(p->>'actor')::uuid and active and role in ('owner','operations')) then raise exception 'denied';end if;
  select * into acct from sculpy_private.gmail_accounts where active for update;
  if acct.id is null then return null;end if;
  update sculpy_private.gmail_accounts set active=false,token_cipher=null,generation=generation+1,lease=null,lease_until=null,status='disconnected',ai_enabled=false where id=acct.id;
  delete from sculpy_private.gmail_oauth_states;
  delete from sculpy_private.gmail_ai_results where message_id in(select id from sculpy_private.gmail_messages where account_id=acct.id);
  update sculpy_private.gmail_messages set body='',snippet='',subject='',from_addresses='[]',to_addresses='[]',attachments='[]',redacted=true where account_id=acct.id;
  insert into public.audit_events(actor_id,entity_type,entity_id,action) values((p->>'actor')::uuid,'gmail_account',acct.id,'disconnect_redact');
  return jsonb_build_object('cipher',acct.token_cipher);
 elsif a='ai_pending' then
  return (select jsonb_build_object('message',m.id,'actor',a.connected_by) from sculpy_private.gmail_messages m join sculpy_private.gmail_accounts a on a.id=m.account_id
   where a.active and a.ai_enabled and not m.redacted and not exists(select 1 from sculpy_private.gmail_ai_results r where r.message_id=m.id and kind='summary') order by m.sent_at desc limit 1);
 elsif a='ai_context' then
  if not exists(select 1 from public.profiles where id=(p->>'actor')::uuid and active and role in ('owner','operations')) then raise exception 'denied';end if;
  return (select jsonb_build_object('message',to_jsonb(m),'rules',(select content from public.sculpy_company_rules where id=true),
   'services',coalesce((select jsonb_agg(jsonb_build_object('code',code,'name',name,'price',default_price_cad)) from public.services where active),'[]'),
   'history',coalesce((select jsonb_agg(x) from (select subject,body,direction,sent_at from sculpy_private.gmail_messages x where x.account_id=m.account_id and x.thread_id=m.thread_id and not x.redacted order by sent_at desc limit 5)x),'[]'),
   'orders',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'number',b.order_number,'status',b.status,'serviceAt',b.starts_at,'price',b.price_cad,'currency',b.currency)) from public.bookings b join sculpy_private.gmail_client_links l on l.client_id=b.client_id where l.message_id=m.id and b.deleted_at is null),'[]'))
   from sculpy_private.gmail_messages m join sculpy_private.gmail_accounts a on a.id=m.account_id where m.id=(p->>'message')::uuid and a.active and a.ai_enabled and not m.redacted);
 elsif a='ai_store' then
  if not exists(select 1 from public.profiles where id=(p->>'actor')::uuid and active and role in ('owner','operations')) then raise exception 'denied';end if;
  if not exists(select 1 from sculpy_private.gmail_messages m join sculpy_private.gmail_accounts a on a.id=m.account_id where m.id=(p->>'message')::uuid and a.active and a.ai_enabled and not m.redacted) then raise exception 'ai_not_enabled';end if;
  insert into sculpy_private.gmail_ai_results(message_id,kind,content,created_by) values((p->>'message')::uuid,p->>'kind',p->'content',(p->>'actor')::uuid)
   on conflict(message_id,kind) do update set content=excluded.content,created_by=excluded.created_by,updated_at=now();
  return jsonb_build_object('ok',true);
 elsif a='claim' then
  select * into acct from sculpy_private.gmail_accounts where active and token_cipher is not null and status<>'reauthorize'
   and (coalesce((p->>'force')::boolean,false) or next_sync_at<=now()) and (lease_until is null or lease_until<now()) for update skip locked limit 1;
  if acct.id is null then return null;end if;
  update sculpy_private.gmail_sync_jobs set status='interrupted',finished_at=now(),code='lease_expired' where account_id=acct.id and status='running';
  update sculpy_private.gmail_accounts set lease=gen_random_uuid(),lease_until=now()+interval '120 seconds' where id=acct.id returning * into acct;
  insert into sculpy_private.gmail_sync_jobs(account_id,status) values(acct.id,'running');
  return to_jsonb(acct);
 elsif a='contacts' then
  -- Resolve exact email only. An ambiguous existing address remains unresolved.
  for rec in select distinct on (lower(trim(email))) lower(trim(email)) email,name,attribution_source
   from public.website_enquiries where not is_test and status<>'spam' and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   order by lower(trim(email)),first_contact_at,id loop
   perform pg_advisory_xact_lock(hashtextextended(rec.email,7));
   select count(*),(array_agg(cp.client_id))[1] into n,cid from public.client_private cp join public.clients c on c.id=cp.client_id
    where c.deleted_at is null and lower(trim(cp.email))=rec.email;
   if n=0 then
    insert into public.clients(display_name,lifecycle_status,referral_source) values(rec.name,'lead',rec.attribution_source) returning id into cid;
    insert into public.client_private(client_id,email) values(cid,rec.email);
    insert into public.audit_events(entity_type,entity_id,action,after_value) values('client',cid,'gmail_exact_email_create',jsonb_build_object('source','website_enquiry'));
   end if;
  end loop;
  return coalesce((select jsonb_agg(x) from (select lower(trim(cp.email)) email,array_agg(c.id) clients
   from public.client_private cp join public.clients c on c.id=cp.client_id where c.deleted_at is null and cp.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   group by lower(trim(cp.email)) order by lower(trim(cp.email)))x),'[]'::jsonb);
 end if;
 if a='oauth_start' then
  insert into sculpy_private.gmail_oauth_states(hash,actor,verifier_cipher) values(p->>'hash',actor,p->>'verifier');
  return jsonb_build_object('ok',true);
 end if;
 select * into acct from sculpy_private.gmail_accounts where id=(p->>'account')::uuid for update;
 if acct.id is null or not acct.active or acct.lease is distinct from (p->>'lease')::uuid or acct.lease_until<now() then raise exception 'stale_lease';end if;
 if a='token' then
  update sculpy_private.gmail_accounts set token_cipher=p->>'cipher' where id=acct.id;
 elsif a='ingest' then
  if jsonb_array_length(p->'messages')>20 then raise exception 'batch_limit';end if;
  for v_msg in select value from jsonb_array_elements(p->'messages') loop
   select array_agg(distinct cp.client_id) into ids from public.client_private cp join public.clients c on c.id=cp.client_id
    where c.deleted_at is null and lower(trim(cp.email)) in (select jsonb_array_elements_text((v_msg->'from')||(v_msg->'to')));
   if ids is null and not (acct.business_label is not null and coalesce((v_msg->>'businessLabel')::boolean,false)) then continue;end if;
   insert into sculpy_private.gmail_messages(account_id,gmail_id,thread_id,from_addresses,to_addresses,subject,body,snippet,attachments,direction,sent_at)
   values(acct.id,v_msg->>'id',v_msg->>'threadId',v_msg->'from',v_msg->'to',left(v_msg->>'subject',1000),left(v_msg->>'body',120000),left(v_msg->>'snippet',2000),v_msg->'attachments',v_msg->>'direction',(v_msg->>'sentAt')::timestamptz)
   on conflict(account_id,gmail_id) do update set body=excluded.body,snippet=excluded.snippet,subject=excluded.subject,from_addresses=excluded.from_addresses,to_addresses=excluded.to_addresses,attachments=excluded.attachments,redacted=false returning id into mid;
   foreach cid in array coalesce(ids,'{}'::uuid[]) loop
    insert into sculpy_private.gmail_client_links values(mid,cid) on conflict do nothing;
   end loop;
   select count(*),(array_agg(b.id))[1] into n,bid from public.bookings b where b.client_id=any(ids) and b.deleted_at is null
    and b.order_number is not null and ((v_msg->>'subject')||' '||(v_msg->>'body')) ~ ('(^|[^0-9])'||b.order_number::text||'([^0-9]|$)');
   if n=1 and not exists(select 1 from sculpy_private.gmail_order_links where message_id=mid and manual) then
    insert into sculpy_private.gmail_order_links(message_id,booking_id) values(mid,bid) on conflict do nothing;
   end if;
   cnt:=cnt+1;
  end loop;
  return jsonb_build_object('count',cnt);
 elsif a='finish' then
  perform sculpy_private.gmail_followup_tick(acct.id);
  update sculpy_private.gmail_accounts set cursor=coalesce(p->>'cursor',cursor),scan=p->'scan',last_sync_at=now(),next_sync_at=now()+interval '5 minutes',lease=null,lease_until=null,status='connected',error_code=null where id=acct.id;
  update sculpy_private.gmail_sync_jobs set status='success',finished_at=now(),message_count=coalesce((p->>'count')::int,0) where account_id=acct.id and status='running';
 elsif a='fail' then
  update sculpy_private.gmail_accounts set lease=null,lease_until=null,error_code=left(p->>'code',50),status=case when p->>'code'='reauthorize' then 'reauthorize' else 'retry' end,next_sync_at=now()+interval '5 minutes' where id=acct.id;
  update sculpy_private.gmail_sync_jobs set status='failed',finished_at=now(),code=left(p->>'code',50) where account_id=acct.id and status='running';
 else raise exception 'unknown_action';end if;
 return jsonb_build_object('ok',true);
end$$;
revoke all on function sculpy_private.gmail_server(text,jsonb) from public,anon,authenticated;
grant execute on function sculpy_private.gmail_server(text,jsonb) to service_role;
create function public.sculpy_gmail_server(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.gmail_server(p_action,p_data)$$;
revoke all on function public.sculpy_gmail_server(text,jsonb) from public,anon,authenticated;
grant execute on function public.sculpy_gmail_server(text,jsonb) to service_role;

create function sculpy_private.gmail_followup_tick(account uuid) returns void language plpgsql security definer set search_path='' as $$
declare rec record;v_rule text;rid uuid;assignee uuid;fallback_assignee uuid;rs jsonb;begin
 select rules into rs from sculpy_private.gmail_accounts where id=account and active;
 if not found then return;end if;
 select id into assignee from public.profiles where active and role in ('operations','owner') order by (role='operations') desc,created_at limit 1;
 if assignee is null then return;end if;fallback_assignee:=assignee;
 update public.reminders r set status='done',updated_at=now() where r.status='open' and exists(
  select 1 from sculpy_private.gmail_followups f join sculpy_private.gmail_messages m on m.id=f.message_id
  where f.reminder_id=r.id and f.rule in ('new_mail','reply_due') and m.account_id=account and exists(
   select 1 from sculpy_private.gmail_messages o where o.account_id=account and o.thread_id=m.thread_id and o.direction='outgoing' and o.sent_at>=m.sent_at));
 for rec in select distinct on(l.client_id,m.thread_id) m.*,l.client_id,
   coalesce(s.state,'active') client_state,
   exists(select 1 from public.bookings b where b.client_id=l.client_id and b.deleted_at is null and b.status='confirmed') booked,
   exists(select 1 from sculpy_private.gmail_messages o where o.account_id=m.account_id and o.thread_id=m.thread_id and o.direction='outgoing' and o.sent_at>=m.sent_at) replied
  from sculpy_private.gmail_messages m join sculpy_private.gmail_client_links l on l.message_id=m.id left join sculpy_private.gmail_client_states s on s.client_id=l.client_id
  where (select count(*) from sculpy_private.gmail_client_links z where z.message_id=m.id)=1 and m.account_id=account and m.direction='incoming' and not m.redacted and m.sent_at>=(select updated_at from sculpy_private.gmail_accounts where id=account) order by l.client_id,m.thread_id,m.sent_at desc,m.id loop
  assignee:=coalesce((select e.handled_by from public.website_enquiries e join public.profiles p on p.id=e.handled_by join public.client_private cp on lower(trim(cp.email))=lower(trim(e.email)) where cp.client_id=rec.client_id and p.active and p.role in ('owner','operations') and not e.is_test order by e.first_contact_at desc limit 1),fallback_assignee);
  foreach v_rule in array array['new_mail','reply_due','quote_first','quote_second'] loop
   if v_rule<>'new_mail' and rec.client_state in ('paused','lost') then continue;end if;
   if v_rule='reply_due' and (rec.replied or rec.sent_at>now()-make_interval(hours=>(rs->>'newHours')::int)) then continue;end if;
   if v_rule in ('quote_first','quote_second') and (rec.booked or rec.client_state='confirmed' or not exists(
    select 1 from public.website_enquiries e join public.client_private cp on cp.client_id=rec.client_id
    where lower(trim(e.email))=lower(trim(cp.email)) and not e.is_test and e.status='quoted'
     and e.quoted_at<=now()-case when v_rule='quote_first' then make_interval(hours=>(rs->>'quoteHours')::int) else make_interval(days=>(rs->>'secondDays')::int) end
     and not exists(select 1 from sculpy_private.gmail_messages x join sculpy_private.gmail_client_links l on l.message_id=x.id where l.client_id=rec.client_id and x.direction='incoming' and x.sent_at>e.quoted_at)
     and exists(select 1 from sculpy_private.gmail_messages x join sculpy_private.gmail_client_links l on l.message_id=x.id where l.client_id=rec.client_id and x.direction='outgoing' and x.sent_at>=e.quoted_at)
    )) then continue;end if;
   if exists(select 1 from sculpy_private.gmail_followups where message_id=rec.id and gmail_followups.rule=v_rule) then continue;end if;
   insert into public.reminders(client_id,assigned_to,due_at,reason,source) values(rec.client_id,assignee,now(),case v_rule when 'new_mail' then '收到新的客户邮件，请查看沟通中心' when 'reply_due' then '客户邮件尚待回复，请查看沟通中心' when 'quote_first' then '报价后第一次跟进建议' else '报价后第二次跟进建议' end,'gmail') returning id into rid;
   insert into sculpy_private.gmail_followups values(rec.id,v_rule,rid);
  end loop;
 end loop;
end$$;
revoke all on function sculpy_private.gmail_followup_tick(uuid) from public,anon,authenticated;

create view sculpy_private.gmail_business_mail with(security_invoker=true) as
 select m.*, exists(select 1 from sculpy_private.gmail_messages newer where newer.account_id=m.account_id and newer.thread_id=m.thread_id and newer.direction='outgoing' and newer.sent_at>=m.sent_at) replied,
 coalesce((select jsonb_agg(l.client_id) from sculpy_private.gmail_client_links l where l.message_id=m.id),'[]') clients,
 coalesce((select jsonb_agg(l.booking_id) from sculpy_private.gmail_order_links l where l.message_id=m.id and linked),'[]') orders
 from sculpy_private.gmail_messages m;
revoke all on sculpy_private.gmail_business_mail from public,anon,authenticated;
create function sculpy_private.gmail_read(p_message uuid,p_client uuid,p_booking uuid,p_filter text,p_query text) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if length(coalesce(p_query,''))>160 or p_filter not in ('all','reply','unlinked') then raise exception 'Invalid search' using errcode='22023';end if;
 with matching as (select m.* from sculpy_private.gmail_business_mail m where
  (p_message is null or m.id=p_message) and (p_client is null or clients @> to_jsonb(p_client::text))
  and (p_booking is null or orders @> to_jsonb(p_booking::text))
  and (p_query='' or strpos(lower(m.subject),lower(p_query))>0)
  and (p_filter<>'reply' or direction='incoming' and not replied)
  and (p_filter<>'unlinked' or clients='[]'::jsonb)),
 page as (select * from matching order by sent_at desc,id limit 50)
 select jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'active',active,'status',status,'lastSync',last_sync_at,'error',error_code,'aiEnabled',ai_enabled,'labelConfigured',business_label is not null,'rules',rules)) from sculpy_private.gmail_accounts),'[]'),
 'total',(select count(*) from matching),'messages',coalesce((select jsonb_agg(to_jsonb(page)-'body'||case when p_message is not null then jsonb_build_object('body',body) else '{}'::jsonb end) from page),'[]'),
 'ai',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'content',content,'updatedAt',updated_at)) from sculpy_private.gmail_ai_results where message_id=p_message),'[]'),
 'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'order_number',b.order_number,'client',c.display_name)) from public.bookings b join public.clients c on c.id=b.client_id where b.deleted_at is null and exists(select 1 from sculpy_private.gmail_client_links l where l.message_id=p_message and l.client_id=b.client_id)),'[]'),
 'clientProfiles',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.display_name)) from public.clients c join sculpy_private.gmail_client_links l on l.client_id=c.id where l.message_id=p_message),'[]'),
 'clientEmail',(select email from public.client_private where client_id=p_client),
 'lastContact',(select max(sent_at) from matching),
 'stats',jsonb_build_object('pending',(select count(*) from matching where direction='incoming' and not replied and not redacted),
 'today',(select count(*) from matching where direction='incoming' and not redacted and (sent_at at time zone 'America/Toronto')::date=(now() at time zone 'America/Toronto')::date),
 'unlinked',(select count(*) from matching where clients='[]'::jsonb and not redacted))) into result;
 return result;
end$$;
revoke all on function sculpy_private.gmail_read(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function sculpy_private.gmail_read(uuid,uuid,uuid,text,text) to authenticated;
create function public.sculpy_gmail_read(p_message uuid default null,p_client uuid default null,p_booking uuid default null,p_filter text default 'all',p_query text default '') returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.gmail_read(p_message,p_client,p_booking,p_filter,p_query)$$;
revoke all on function public.sculpy_gmail_read(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.sculpy_gmail_read(uuid,uuid,uuid,text,text) to authenticated;

create function sculpy_private.gmail_action(a text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare bid uuid;mid uuid;cid uuid;begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if p->>'confirmed' is distinct from 'true' then raise exception 'Confirmation required' using errcode='22023';end if;
 if a='contact_email' then
  cid:=(p->>'client')::uuid;
  if not exists(select 1 from public.clients where id=cid and deleted_at is null) or p->>'email' is null or length(p->>'email')>254 or p->>'email' !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then raise exception 'Invalid email' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(p->>'email'),7));
  if exists(select 1 from public.client_private cp join public.clients c on c.id=cp.client_id where lower(trim(cp.email))=lower(trim(p->>'email')) and cp.client_id<>cid and c.deleted_at is null) then raise exception 'Email belongs to another customer; review before linking' using errcode='23505';end if;
  insert into public.client_private(client_id,email) values(cid,lower(trim(p->>'email'))) on conflict(client_id) do update set email=excluded.email,updated_at=now();
 elsif a='link_client' then
  cid:=(p->>'client')::uuid;mid:=(p->>'message')::uuid;
  if not exists(select 1 from public.clients where id=cid and deleted_at is null) or not exists(select 1 from sculpy_private.gmail_messages where id=mid and not redacted) then raise exception 'Invalid client/message' using errcode='22023';end if;
  insert into sculpy_private.gmail_client_links values(mid,cid) on conflict do nothing;
 elsif a='link_order' then
  bid:=(p->>'booking')::uuid;mid:=(p->>'message')::uuid;
  if not exists(select 1 from public.bookings b join sculpy_private.gmail_client_links l on l.client_id=b.client_id where b.id=bid and b.deleted_at is null and l.message_id=mid) then raise exception 'Client/order mismatch' using errcode='22023';end if;
  insert into sculpy_private.gmail_order_links values(mid,bid,coalesce((p->>'linked')::boolean,true),true,auth.uid())
   on conflict(message_id,booking_id) do update set linked=excluded.linked,manual=true,actor=excluded.actor;
 elsif a='state' then
  cid:=(p->>'client')::uuid;
  if not exists(select 1 from public.clients where id=cid and deleted_at is null) then raise exception 'Client missing';end if;
  insert into sculpy_private.gmail_client_states values(cid,p->>'state',auth.uid(),now()) on conflict(client_id) do update set state=excluded.state,updated_by=excluded.updated_by,updated_at=now();
  update public.reminders r set status='dismissed',updated_at=now() where r.client_id=cid and r.status='open' and exists(select 1 from sculpy_private.gmail_followups f where f.reminder_id=r.id and f.rule<>'new_mail' and (p->>'state' in ('paused','lost') or p->>'state'='confirmed' and f.rule in ('quote_first','quote_second')));
 elsif a='settings' then
  update sculpy_private.gmail_accounts set ai_enabled=coalesce((p->>'aiEnabled')::boolean,false),rules=jsonb_build_object(
   'newHours',greatest(1,least(168,coalesce((p->>'newHours')::int,2))),
   'quoteHours',greatest(1,least(720,coalesce((p->>'quoteHours')::int,48))),
   'secondDays',greatest(1,least(90,coalesce((p->>'secondDays')::int,5)))) where active;
 elsif a='save_reply' then
  mid:=(p->>'message')::uuid;
  if not exists(select 1 from sculpy_private.gmail_messages where id=mid and not redacted) or p->>'text' is null or length(p->>'text') not between 1 and 20000 then raise exception 'Invalid draft';end if;
  insert into sculpy_private.gmail_ai_results(message_id,kind,content,created_by) values(mid,'reply',jsonb_build_object('text',p->>'text','humanEdited',true),auth.uid())
   on conflict(message_id,kind) do update set content=excluded.content,created_by=excluded.created_by,updated_at=now();
 else raise exception 'Invalid action';end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_value) values(auth.uid(),'gmail',coalesce(mid,cid,bid),a,jsonb_build_object('confirmed',true));
 return jsonb_build_object('ok',true);
end$$;
revoke all on function sculpy_private.gmail_action(text,jsonb) from public,anon,authenticated;
grant execute on function sculpy_private.gmail_action(text,jsonb) to authenticated;
create function public.sculpy_gmail_action(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.gmail_action(p_action,p_data)$$;
revoke all on function public.sculpy_gmail_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.sculpy_gmail_action(text,jsonb) to authenticated;
commit;
