-- V2.5 P0. Push state is server-only; the existing account/CRM policies are unchanged.
create table sculpy_private.push_config (
 id boolean primary key default true check(id), enabled boolean not null default false,
 overdue_hours integer not null default 24 check(overdue_hours between 1 and 168),
 repeat_hours integer not null default 0 check(repeat_hours=0 or repeat_hours between 24 and 168),
 worker_url text not null default '', worker_secret_id uuid, vapid_secret_id uuid,
 public_key text, last_tick_at timestamptz, last_kick_at timestamptz,
 scheduler_installed boolean not null default false
);
insert into sculpy_private.push_config(id) values(true);
create table sculpy_private.push_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false, new_enquiry boolean not null default true,
 overdue boolean not null default true,
 updated_at timestamptz not null default now()
);
create table sculpy_private.push_devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null, endpoint text not null unique check(length(endpoint)<=2048),
 p256dh text not null, auth_key text not null, label text not null default '浏览器设备' check(length(label)<=80),
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index push_devices_user_idx on sculpy_private.push_devices(user_id,active);
create index push_devices_session_idx on sculpy_private.push_devices(session_id);
create table sculpy_private.push_notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('new_enquiry','overdue','test')),
 enquiry_id uuid references public.website_enquiries(id) on delete cascade,
 event_key text not null unique, title text not null, created_at timestamptz not null default now(), read_at timestamptz
);
create index push_notifications_recipient_idx on sculpy_private.push_notifications(recipient_id,created_at desc);
create table sculpy_private.push_deliveries (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references sculpy_private.push_notifications(id) on delete cascade,
 device_id uuid not null references sculpy_private.push_devices(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed','cancelled')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease uuid, leased_until timestamptz, last_code text, accepted_at timestamptz,
 expires_at timestamptz not null default now()+interval '24 hours', unique(notification_id,device_id)
);
create index push_deliveries_due_idx on sculpy_private.push_deliveries(next_attempt_at) where status in ('pending','sending');
create table sculpy_private.push_errors (
 id bigint generated always as identity primary key, source text not null, code text not null,
 created_at timestamptz not null default now()
);
do $$declare t text;begin
 foreach t in array array['push_config','push_preferences','push_devices','push_notifications','push_deliveries','push_errors'] loop
  execute format('alter table sculpy_private.%I enable row level security',t);
  execute format('revoke all on sculpy_private.%I from public,anon,authenticated',t);
 end loop;
end$$;

create function sculpy_private.push_session_valid(p_user uuid,p_session uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 return exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user and (s.not_after is null or s.not_after>now()));
end$$;
create function sculpy_private.push_can_view(p_recipient uuid,p_kind text,p_enquiry uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 return exists(select 1 from public.profiles p where p.id=p_recipient and p.active and
  (p_kind='test' or p.role in ('operations','owner') and exists(select 1 from public.website_enquiries e where e.id=p_enquiry and not e.is_test)));
end$$;
create function sculpy_private.push_can_receive(p_recipient uuid,p_kind text,p_enquiry uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare r public.profiles; e public.website_enquiries;
begin
 select * into r from public.profiles where id=p_recipient and active;
 if not found then return false;end if;
 if p_kind='test' then return true;end if;
 if r.role not in ('operations','owner') then return false;end if;
 select * into e from public.website_enquiries where id=p_enquiry and not is_test;
 if not found then return false;end if;
 if p_kind='new_enquiry' then return e.entry_channel='website' and e.status='pending';end if;
 if p_kind='overdue' then
  return e.status='pending' and (e.handled_by=p_recipient or not exists(
   select 1 from public.profiles p where p.id=e.handled_by and p.active and p.role in ('operations','owner')));
 end if;
 return false;
end$$;
create function sculpy_private.push_delivery_allowed(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 return exists(select 1 from sculpy_private.push_deliveries d
 join sculpy_private.push_notifications n on n.id=d.notification_id
 join sculpy_private.push_devices v on v.id=d.device_id
 join sculpy_private.push_preferences p on p.user_id=v.user_id
 join sculpy_private.push_config c on c.id
 where d.id=p_id and c.enabled and v.active and p.enabled and n.recipient_id=v.user_id
 and d.expires_at>now() and sculpy_private.push_session_valid(v.user_id,v.session_id)
 and sculpy_private.push_can_receive(n.recipient_id,n.kind,n.enquiry_id)
 and (n.kind='test' or n.kind='new_enquiry' and p.new_enquiry or n.kind='overdue' and p.overdue));
end$$;
create function sculpy_private.push_enqueue(p_user uuid,p_kind text,p_enquiry uuid,p_event text,p_title text,p_device uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$declare nid uuid;begin
 if not exists(select 1 from sculpy_private.push_config where id and enabled)
 or not sculpy_private.push_can_receive(p_user,p_kind,p_enquiry)
 or not exists(select 1 from sculpy_private.push_preferences p where p.user_id=p_user and p.enabled
 and (p_kind='test' or p_kind='new_enquiry' and p.new_enquiry or p_kind='overdue' and p.overdue))
 then return null;end if;
 if not exists(select 1 from sculpy_private.push_devices v where v.user_id=p_user and v.active
 and (p_device is null or v.id=p_device) and sculpy_private.push_session_valid(v.user_id,v.session_id)) then return null;end if;
 insert into sculpy_private.push_notifications(recipient_id,kind,enquiry_id,event_key,title)
 values(p_user,p_kind,p_enquiry,p_event,p_title) on conflict(event_key) do nothing returning id into nid;
 if nid is null then return null;end if;
 insert into sculpy_private.push_deliveries(notification_id,device_id)
 select nid,v.id from sculpy_private.push_devices v where v.user_id=p_user and v.active
 and (p_device is null or v.id=p_device) and sculpy_private.push_session_valid(v.user_id,v.session_id);
 return nid;
end$$;
create function sculpy_private.kick_push_worker() returns boolean
language plpgsql security definer set search_path='' as $$declare c sculpy_private.push_config; k text;begin
 select * into c from sculpy_private.push_config where id;
 if not c.enabled or c.worker_url='' or c.worker_secret_id is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return false;end if;
 select decrypted_secret into k from vault.decrypted_secrets where id=c.worker_secret_id;
 perform net.http_post(url:=c.worker_url,body:='{}'::jsonb,
 headers:=jsonb_build_object('Content-Type','application/json','x-sculpy-worker-key',k),timeout_milliseconds:=30000);
 return true;
exception when others then
 begin insert into sculpy_private.push_errors(source,code) values('worker-kick',sqlstate);exception when others then null;end;
 return false;
end$$;
create function sculpy_private.push_new_website_enquiry() returns trigger
language plpgsql security definer set search_path='' as $$declare p record;begin
 if new.entry_channel<>'website' or new.is_test then return new;end if;
 for p in select id from public.profiles where active and role in ('operations','owner') loop
  perform sculpy_private.push_enqueue(p.id,'new_enquiry',new.id,'new:'||new.id||':'||p.id,
   case when new.service_type='wedding' then '收到新的婚礼询盘' else '收到新的官网询盘' end);
 end loop;
 perform sculpy_private.kick_push_worker();
 return new;
exception when others then
 begin insert into sculpy_private.push_errors(source,code) values('website-trigger',sqlstate);exception when others then null;end;
 return new;
end$$;
create trigger notify_new_website_enquiry after insert on public.website_enquiries
 for each row execute function sculpy_private.push_new_website_enquiry();
create function sculpy_private.push_profile_changed() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if (old.active and not new.active) or old.role is distinct from new.role then
  update sculpy_private.push_devices set active=false,updated_at=now() where user_id=new.id;
  update sculpy_private.push_preferences set enabled=false,updated_at=now() where user_id=new.id;
  update sculpy_private.push_deliveries d set status='cancelled',last_code='account_changed'
   from sculpy_private.push_notifications n where n.id=d.notification_id and n.recipient_id=new.id and d.status in ('pending','sending');
 end if;return new;
exception when others then
 begin insert into sculpy_private.push_errors(source,code) values('profile-trigger',sqlstate);exception when others then null;end;
 return new;
end$$;
create trigger revoke_push_on_profile_change after update of active,role on public.profiles
 for each row execute function sculpy_private.push_profile_changed();

-- Browser requests reach this function only through the JWT-validating Edge Function.
create function sculpy_private.push_api(p_action text,p_actor uuid,p_session uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; prefs sculpy_private.push_preferences; c sculpy_private.push_config;
 device_row sculpy_private.push_devices; notice_row sculpy_private.push_notifications; sub jsonb; nid uuid; eid uuid;
begin
 select * into actor from public.profiles where id=p_actor and active;
 if not found or not sculpy_private.push_session_valid(p_actor,p_session) then raise exception 'Active session required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>8192 then raise exception 'Invalid notification request' using errcode='22023';end if;
 insert into sculpy_private.push_preferences(user_id) values(p_actor) on conflict do nothing;
 select * into prefs from sculpy_private.push_preferences where user_id=p_actor;
 select * into c from sculpy_private.push_config where id;
 if p_action='state' then
  return jsonb_build_object('preferences',to_jsonb(prefs)-'user_id','publicKey',c.public_key,'systemEnabled',c.enabled,
   'devices',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'active',active,'currentSession',session_id=p_session,'updatedAt',updated_at)),'[]') from sculpy_private.push_devices where user_id=p_actor),
   'config',case when actor.role='operations' then jsonb_build_object('enabled',c.enabled,'overdueHours',c.overdue_hours,'repeatHours',c.repeat_hours,'schedulerInstalled',c.scheduler_installed,'lastTickAt',c.last_tick_at) else null end);
 elsif p_action='preferences' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('enabled','new_enquiry','overdue'))
  or not (p_data ?& array['enabled','new_enquiry','overdue'])
  or jsonb_typeof(p_data->'enabled')<>'boolean' or jsonb_typeof(p_data->'new_enquiry')<>'boolean'
  or jsonb_typeof(p_data->'overdue')<>'boolean'
  then raise exception 'Invalid preferences' using errcode='22023';end if;
  update sculpy_private.push_preferences set enabled=(p_data->>'enabled')::boolean,
   new_enquiry=actor.role in ('operations','owner') and (p_data->>'new_enquiry')::boolean,
   overdue=actor.role in ('operations','owner') and (p_data->>'overdue')::boolean,
   updated_at=now() where user_id=p_actor;
  if not (p_data->>'enabled')::boolean then
   update sculpy_private.push_devices set active=false,updated_at=now() where user_id=p_actor;
   update sculpy_private.push_deliveries d set status='cancelled',last_code='user_disabled' from sculpy_private.push_notifications n
   where n.id=d.notification_id and n.recipient_id=p_actor and d.status in ('pending','sending');
  end if;
  return jsonb_build_object('ok',true);
 elsif p_action='subscribe' then
  sub=p_data->'subscription';
  if not c.enabled or c.public_key is null then raise exception 'Push service not ready' using errcode='55000';end if;
  if coalesce(sub->>'endpoint','') !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-zA-Z0-9-]+\.)*push\.apple\.com|([a-zA-Z0-9-]+\.)*notify\.windows\.com)/[^[:space:]#]+$'
  or length(sub->>'endpoint')>2048 or coalesce(sub->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}$'
  or coalesce(sub->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invalid push subscription' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('push-devices:'||p_actor::text,0));
  if (select count(*) from sculpy_private.push_devices where user_id=p_actor and active and sculpy_private.push_session_valid(user_id,session_id))>=10
   and not exists(select 1 from sculpy_private.push_devices where endpoint=sub->>'endpoint' and user_id=p_actor) then
   raise exception 'Device limit reached' using errcode='P0429';end if;
  perform pg_advisory_xact_lock(hashtextextended(sub->>'endpoint',0));
  insert into sculpy_private.push_devices(user_id,session_id,endpoint,p256dh,auth_key,label)
  values(p_actor,p_session,sub->>'endpoint',sub->'keys'->>'p256dh',sub->'keys'->>'auth',left(coalesce(p_data->>'label','浏览器设备'),80))
  on conflict(endpoint) do update set user_id=excluded.user_id,session_id=excluded.session_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key,
   label=excluded.label,active=true,updated_at=now() returning * into device_row;
  update sculpy_private.push_preferences set enabled=true,updated_at=now() where user_id=p_actor;
  return jsonb_build_object('ok',true,'deviceId',device_row.id);
 elsif p_action in ('unsubscribe','logout') then
  update sculpy_private.push_devices set active=false,updated_at=now()
   where user_id=p_actor and (id=(p_data->>'deviceId')::uuid or p_action='logout' and (session_id=p_session or endpoint=p_data->>'endpoint'));
  update sculpy_private.push_deliveries d set status='cancelled',last_code='device_revoked' from sculpy_private.push_devices v
   where v.id=d.device_id and not v.active and v.user_id=p_actor and d.status in ('pending','sending');
  return jsonb_build_object('ok',true);
 elsif p_action='history' then
  return jsonb_build_object('items',(select coalesce(jsonb_agg(x),'[]') from (
   select n.id,n.kind,n.title,n.created_at,n.read_at,
    (select coalesce(jsonb_agg(jsonb_build_object('status',d.status,'attempts',d.attempts,'code',d.last_code,'acceptedAt',d.accepted_at)),'[]') from sculpy_private.push_deliveries d where d.notification_id=n.id) deliveries
   from sculpy_private.push_notifications n where n.recipient_id=p_actor and sculpy_private.push_can_view(p_actor,n.kind,n.enquiry_id)
   order by n.created_at desc limit 50) x));
 elsif p_action='open' then
  select * into notice_row from sculpy_private.push_notifications where id=(p_data->>'id')::uuid and recipient_id=p_actor;
  if not found or not sculpy_private.push_can_view(p_actor,notice_row.kind,notice_row.enquiry_id) then raise exception 'Notification unavailable' using errcode='42501';end if;
  update sculpy_private.push_notifications set read_at=coalesce(read_at,now()) where id=notice_row.id;
  return jsonb_build_object('type',case when notice_row.kind='test' then 'settings' else 'lead' end,'id',notice_row.enquiry_id);
 elsif p_action='test' then
  perform pg_advisory_xact_lock(hashtextextended('push-test:'||p_actor::text,0));
  select * into device_row from sculpy_private.push_devices where id=(p_data->>'deviceId')::uuid and user_id=p_actor and session_id=p_session and active;
  if not found then raise exception 'Enable this device first' using errcode='42501';end if;
  if exists(select 1 from sculpy_private.push_notifications where recipient_id=p_actor and kind='test' and created_at>now()-interval '60 seconds') then raise exception 'Wait before another test' using errcode='P0429';end if;
  nid=sculpy_private.push_enqueue(p_actor,'test',null,'test:'||gen_random_uuid(),'Sculpy 推送测试',device_row.id);
  if nid is null then raise exception 'Push service paused' using errcode='55000';end if;
  perform sculpy_private.kick_push_worker();return jsonb_build_object('ok',true,'id',nid);
 elsif p_action='global' then
  if actor.role<>'operations' then raise exception 'System administrator required' using errcode='42501';end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('enabled','overdueHours','repeatHours'))
  or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or not (p_data ?& array['enabled','overdueHours','repeatHours'])
  then raise exception 'Invalid configuration' using errcode='22023';end if;
  update sculpy_private.push_config set enabled=(p_data->>'enabled')::boolean,overdue_hours=(p_data->>'overdueHours')::integer,repeat_hours=(p_data->>'repeatHours')::integer where id;
  insert into public.audit_events(actor_id,entity_type,action,after_value) values(p_actor,'notification_config','push_config_update',p_data);
  return jsonb_build_object('ok',true);
 elsif p_action='diagnostics' then
  if actor.role<>'operations' then raise exception 'System administrator required' using errcode='42501';end if;
  return jsonb_build_object('queue',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from sculpy_private.push_deliveries group by status) q),
   'errors',(select coalesce(jsonb_agg(q),'[]') from (select source,code,created_at from sculpy_private.push_errors order by id desc limit 20) q));
 end if;
 raise exception 'Unknown notification action' using errcode='22023';
end$$;

create function sculpy_private.push_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c sculpy_private.push_config; stored text; secret_id uuid; e record; r record; 
 delivery_row sculpy_private.push_deliveries; notice_row sculpy_private.push_notifications; device_row sculpy_private.push_devices; ids jsonb; bucket bigint; delay_seconds integer;
begin
 select * into c from sculpy_private.push_config where id;
 if p_action='authorize_worker' then
  if c.worker_secret_id is null then return jsonb_build_object('authorized',false);end if;
  select decrypted_secret into stored from vault.decrypted_secrets where id=c.worker_secret_id;
  return jsonb_build_object('authorized',stored is not null and stored=p_data->>'key');
 elsif p_action='identity' then
  select * into c from sculpy_private.push_config where id for update;
  if c.vapid_secret_id is null then
   if coalesce(p_data->>'publicKey','') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(p_data->>'privateKey','') !~ '^[A-Za-z0-9_-]{43}$' then return '{}'::jsonb;end if;
   select vault.create_secret(p_data->>'privateKey','sculpy-vapid-private','SCULPY Web Push server identity') into secret_id;
   update sculpy_private.push_config set public_key=p_data->>'publicKey',vapid_secret_id=secret_id where id;
   c.public_key=p_data->>'publicKey';c.vapid_secret_id=secret_id;
  end if;
  select decrypted_secret into stored from vault.decrypted_secrets where id=c.vapid_secret_id;
  return jsonb_build_object('publicKey',c.public_key,'privateKey',stored);
 elsif p_action='tick' then
  if not c.enabled then return jsonb_build_object('enabled',false);end if;
  for e in select * from public.website_enquiries where not is_test and status='pending' and first_contact_at<=now()-make_interval(hours=>c.overdue_hours) loop
   bucket=case when c.repeat_hours=0 then 0 else floor(extract(epoch from(now()-e.first_contact_at-make_interval(hours=>c.overdue_hours)))/(c.repeat_hours*3600))::bigint end;
   for r in select id from public.profiles where active and role in ('operations','owner') loop
    perform sculpy_private.push_enqueue(r.id,'overdue',e.id,'overdue:'||e.id||':'||r.id||':'||bucket,'有询盘等待跟进');
   end loop;
  end loop;
  update sculpy_private.push_config set last_tick_at=now() where id;
  return jsonb_build_object('enabled',true);
 elsif p_action='claim' then
  update sculpy_private.push_deliveries set status='failed',last_code='lease_expired'
   where status='sending' and leased_until<now() and attempts>=5;
  update sculpy_private.push_deliveries set status='cancelled',last_code='no_longer_authorized' where status in ('pending','sending') and not sculpy_private.push_delivery_allowed(id);
  with due as (
    select d.id from sculpy_private.push_deliveries d join sculpy_private.push_notifications n on n.id=d.notification_id
    where (d.status='pending' and d.next_attempt_at<=now() or d.status='sending' and d.leased_until<now()) and d.attempts<5
    order by d.next_attempt_at,d.id for update of d skip locked limit 10
   ), claimed as (update sculpy_private.push_deliveries d set status='sending',attempts=attempts+1,lease=gen_random_uuid(),leased_until=now()+interval '2 minutes'
    from due where d.id=due.id returning d.id,d.lease
  ) select coalesce(jsonb_agg(claimed),'[]') into ids from claimed;
  return jsonb_build_object('items',ids);
 elsif p_action='prepare' then
  select * into delivery_row from sculpy_private.push_deliveries where id=(p_data->>'id')::uuid and lease=(p_data->>'lease')::uuid and status='sending' and leased_until>now();
  if not found then return '{}'::jsonb;end if;
  if not sculpy_private.push_delivery_allowed(delivery_row.id) then
   update sculpy_private.push_deliveries set status='cancelled',last_code='no_longer_authorized' where id=delivery_row.id;return '{}'::jsonb;
  end if;
  select * into notice_row from sculpy_private.push_notifications where id=delivery_row.notification_id;
  select * into device_row from sculpy_private.push_devices where id=delivery_row.device_id;
  return jsonb_build_object('notification',jsonb_build_object('id',notice_row.id,'kind',notice_row.kind,'title',notice_row.title,'body','请打开 Sculpy 查看。'),
   'subscription',jsonb_build_object('endpoint',device_row.endpoint,'keys',jsonb_build_object('p256dh',device_row.p256dh,'auth',device_row.auth_key)));
 elsif p_action='finish' then
  select * into delivery_row from sculpy_private.push_deliveries where id=(p_data->>'id')::uuid and lease=(p_data->>'lease')::uuid and status='sending' for update;
  if not found then return jsonb_build_object('ignored',true);end if;
  if p_data->>'result'='accepted' then
   update sculpy_private.push_deliveries set status='accepted',accepted_at=now(),last_code=p_data->>'code' where id=delivery_row.id;
  elsif p_data->>'result'='gone' then
   update sculpy_private.push_devices set active=false,updated_at=now() where id=delivery_row.device_id;
   update sculpy_private.push_deliveries set status='cancelled',last_code='subscription_expired' where device_id=delivery_row.device_id and status in ('pending','sending');
  elsif p_data->>'result'='retry' and delivery_row.attempts<5 then
   delay_seconds=greatest(30*power(2,delivery_row.attempts-1)::integer,least(3600,greatest(0,coalesce((p_data->>'retryAfter')::integer,0))));
   update sculpy_private.push_deliveries set status='pending',next_attempt_at=now()+make_interval(secs=>delay_seconds),last_code=left(p_data->>'code',40) where id=delivery_row.id;
  else update sculpy_private.push_deliveries set status='failed',last_code=left(coalesce(p_data->>'code','failed'),40) where id=delivery_row.id;
  end if;
  if p_data->>'result'<>'accepted' then insert into sculpy_private.push_errors(source,code) values('push-service',left(coalesce(p_data->>'code','failed'),40));end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown server action' using errcode='22023';
end$$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='sculpy_private' and (p.proname like 'push_%' or p.proname='kick_push_worker') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 end loop;
end$$;
grant usage on schema sculpy_private to service_role;
grant execute on function sculpy_private.push_api(text,uuid,uuid,jsonb),sculpy_private.push_server(text,jsonb) to service_role;
create function public.sculpy_push_api(p_action text,p_actor uuid,p_session uuid,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.push_api(p_action,p_actor,p_session,p_data)$$;
create function public.sculpy_push_server(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.push_server(p_action,p_data)$$;
revoke all on function public.sculpy_push_api(text,uuid,uuid,jsonb),public.sculpy_push_server(text,jsonb) from public,anon,authenticated;
grant execute on function public.sculpy_push_api(text,uuid,uuid,jsonb),public.sculpy_push_server(text,jsonb) to service_role;
