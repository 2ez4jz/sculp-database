begin;

alter table public.miranda_schedule
 add column reminder_start_minutes integer check(reminder_start_minutes in (0,15,30,60,90,120,180,240,360,720,1440)),
 add column reminder_end_minutes integer check(reminder_end_minutes in (0,15,30,60,90,120,180,240,360,720,1440)),
 add column reminder_evening text not null default 'auto' check(reminder_evening in ('auto','always','off')),
 -- Keep airport-local timestamps for tickets while grouping timed entries by the planner's day.
 add column agenda_start_local timestamp generated always as (
  case when all_day or starts_local at time zone start_timezone < timestamptz '2026-11-23 00:00:00+08:00'
   then starts_local else (starts_local at time zone start_timezone) at time zone 'Asia/Shanghai' end
 ) stored,
 add column agenda_end_local timestamp generated always as (
  case when all_day or ends_local at time zone end_timezone < timestamptz '2026-11-23 00:00:00+08:00'
   then ends_local else (ends_local at time zone end_timezone) at time zone 'Asia/Shanghai' end
 ) stored;

-- Schedule details can appear on a lock screen. Each account has its own opt-in.
alter table sculpy_private.push_preferences add column itinerary boolean not null default false;
alter table sculpy_private.push_notifications
 add column itinerary_id uuid references public.miranda_schedule(id) on delete cascade,
 add column itinerary_moment text check(itinerary_moment in ('start','end')),
 add column itinerary_alert text check(itinerary_alert in ('before','evening')),
 add column itinerary_event_at timestamptz,
 add column itinerary_due_at timestamptz,
 drop constraint push_notifications_kind_check,
 add constraint push_notifications_kind_check check(kind in ('new_enquiry','overdue','test','marketing_mention','itinerary')),
 add constraint push_itinerary_data_check check(
  (kind='itinerary' and enquiry_id is null and itinerary_id is not null and itinerary_moment is not null
   and itinerary_alert is not null and itinerary_event_at is not null and itinerary_due_at is not null
   and itinerary_due_at < itinerary_event_at)
  or (kind<>'itinerary' and itinerary_id is null and itinerary_moment is null and itinerary_alert is null
      and itinerary_event_at is null and itinerary_due_at is null)
 );
create index push_notifications_itinerary_idx on sculpy_private.push_notifications(itinerary_id) where itinerary_id is not null;

create function sculpy_private.itinerary_recipient(p_user uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and p.active
  and ((p.username='sculp_jz' and p.role='operations') or (p.username='sculp_miranda' and p.role='owner')))
$$;

-- Miranda's calendar changes clocks at midnight on Nov 23 in China. Use the
-- event instant to choose the clock, even when its evening alert is on Nov 22.
create function sculpy_private.itinerary_clock(p_at timestamptz) returns text
language sql immutable strict set search_path='' as $$
 select case when p_at >= timestamptz '2026-11-23 00:00:00+08:00' then 'Asia/Shanghai' else 'America/Toronto' end
$$;

create function sculpy_private.itinerary_reminders(p_item public.miranda_schedule)
returns table(moment text, alert text, event_at timestamptz, due_at timestamptz, local_time timestamp,
              local_zone text, clock_time timestamp, clock_zone text, place text)
language sql stable set search_path='' as $$
 with moments as (
  select v.*, v.local_time at time zone v.local_zone as event_at
  from (values
   ('start',p_item.starts_local,p_item.start_timezone,p_item.location,
    coalesce(p_item.reminder_start_minutes,case p_item.category when 'flight' then 180 when 'hotel' then 60 else 30 end)),
   ('end',p_item.ends_local,p_item.end_timezone,case when p_item.category='flight' then p_item.destination else p_item.location end,
    coalesce(p_item.reminder_end_minutes,case when p_item.category='hotel' then 60 else 0 end))
  ) as v(moment,local_time,local_zone,place,lead_minutes)
  where not p_item.all_day and not p_item.completed and v.local_time is not null
 ), clocked as (
  select m.*, sculpy_private.itinerary_clock(m.event_at) as clock_zone,
    m.event_at at time zone sculpy_private.itinerary_clock(m.event_at) as clock_time
  from moments m
 ), scheduled as (
  select c.*, c.event_at-make_interval(mins=>c.lead_minutes) as before_at,
    case when p_item.reminder_evening<>'off' and (
      c.lead_minutes>0 and c.clock_time::time < time '09:00'
      or p_item.reminder_evening='always' and c.moment='start'
    ) then (c.clock_time::date-1+time '22:00') at time zone c.clock_zone end as evening_at
  from clocked c
 )
 select s.moment, d.alert, s.event_at, d.due_at, s.local_time, s.local_zone, s.clock_time, s.clock_zone, s.place
 from scheduled s
 cross join lateral (values
   ('before',case when s.lead_minutes>0 and s.before_at is distinct from s.evening_at then s.before_at end),
   ('evening',s.evening_at)
 ) as d(alert,due_at)
 where d.due_at is not null and d.due_at < s.event_at
$$;

create function sculpy_private.enqueue_itinerary_reminders() returns void
language sql set search_path='' as $$
 with recipients as (
  select p.user_id from sculpy_private.push_preferences p
  where p.enabled and p.itinerary and sculpy_private.itinerary_recipient(p.user_id)
  and exists(select 1 from sculpy_private.push_devices d where d.user_id=p.user_id and d.active
    and sculpy_private.push_session_valid(d.user_id,d.session_id))
 ), inserted as (
  insert into sculpy_private.push_notifications(recipient_id,kind,title,event_key,itinerary_id,
     itinerary_moment,itinerary_alert,itinerary_event_at,itinerary_due_at)
  select p.user_id,'itinerary',case when r.alert='evening' then 'Miranda 前夜行程提醒' else 'Miranda 行程提醒' end,
    concat_ws(':','itinerary',a.id,r.moment,r.alert,extract(epoch from r.event_at),extract(epoch from r.due_at),p.user_id),
    a.id,r.moment,r.alert,r.event_at,r.due_at
  from recipients p
  cross join public.miranda_schedule a
  cross join lateral sculpy_private.itinerary_reminders(a) r
  where not a.all_day and not a.completed
    and a.first_day <= (now() at time zone 'UTC')::date+3 and a.last_day >= (now() at time zone 'UTC')::date-1
    and r.event_at>now() and r.due_at between now()-interval '12 minutes' and now()
  on conflict(event_key) do nothing
  returning id,recipient_id,itinerary_event_at,itinerary_due_at
 )
 insert into sculpy_private.push_deliveries(notification_id,device_id,expires_at)
 select n.id,d.id,least(n.itinerary_event_at,n.itinerary_due_at+interval '12 minutes')
 from inserted n join sculpy_private.push_devices d on d.user_id=n.recipient_id and d.active
 where sculpy_private.push_session_valid(d.user_id,d.session_id)
$$;

-- Resolve fresh data at delivery time. Rescheduling, completion or deletion
-- invalidates an existing queued occurrence before it reaches a device.
create function sculpy_private.current_itinerary_reminder(p_notice sculpy_private.push_notifications)
returns table(moment text, alert text, event_at timestamptz, due_at timestamptz, local_time timestamp,
              local_zone text, clock_time timestamp, clock_zone text, place text,
              title text, category text, flight_number text)
language sql stable set search_path='' as $$
 select r.*, a.title, a.category, a.flight_number
 from public.miranda_schedule a cross join lateral sculpy_private.itinerary_reminders(a) r
 where a.id=p_notice.itinerary_id and r.moment=p_notice.itinerary_moment and r.alert=p_notice.itinerary_alert
  and r.event_at=p_notice.itinerary_event_at and r.due_at=p_notice.itinerary_due_at
$$;

revoke all on function sculpy_private.itinerary_recipient(uuid), sculpy_private.itinerary_clock(timestamptz),
 sculpy_private.itinerary_reminders(public.miranda_schedule), sculpy_private.enqueue_itinerary_reminders(),
 sculpy_private.current_itinerary_reminder(sculpy_private.push_notifications) from public,anon,authenticated;

create or replace function sculpy_private.push_can_view(p_recipient uuid,p_kind text,p_enquiry uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 return exists(select 1 from public.profiles p where p.id=p_recipient and p.active and
  (p_kind='test' or p_kind='itinerary' and sculpy_private.itinerary_recipient(p_recipient) or p.role in ('operations','owner') and
   (p_kind='marketing_mention' or exists(select 1 from public.website_enquiries e where e.id=p_enquiry and not e.is_test))));
end $$;

create or replace function sculpy_private.push_delivery_allowed(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 return exists(select 1 from sculpy_private.push_deliveries d
 join sculpy_private.push_notifications n on n.id=d.notification_id
 join sculpy_private.push_devices v on v.id=d.device_id
 join sculpy_private.push_preferences p on p.user_id=v.user_id
 join sculpy_private.push_config c on c.id
 where d.id=p_id and c.enabled and v.active and p.enabled and n.recipient_id=v.user_id
 and d.expires_at>now() and sculpy_private.push_session_valid(v.user_id,v.session_id)
 and (
  n.kind='itinerary' and p.itinerary and sculpy_private.itinerary_recipient(n.recipient_id)
   and n.itinerary_event_at>now() and exists(select 1 from sculpy_private.current_itinerary_reminder(n))
  or sculpy_private.push_can_receive(n.recipient_id,n.kind,n.enquiry_id)
   and (n.kind in ('test','marketing_mention') or n.kind='new_enquiry' and p.new_enquiry or n.kind='overdue' and p.overdue)
 ));
end $$;

create or replace function sculpy_private.push_api(p_action text,p_actor uuid,p_session uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; prefs sculpy_private.push_preferences; c sculpy_private.push_config;
 device_row sculpy_private.push_devices; notice_row sculpy_private.push_notifications; sub jsonb; nid uuid; itinerary_day date;
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
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('enabled','new_enquiry','overdue','itinerary'))
  or not (p_data ?& array['enabled','new_enquiry','overdue'])
  or jsonb_typeof(p_data->'enabled')<>'boolean' or jsonb_typeof(p_data->'new_enquiry')<>'boolean'
  or jsonb_typeof(p_data->'overdue')<>'boolean'
  or (p_data ? 'itinerary' and jsonb_typeof(p_data->'itinerary') is distinct from 'boolean')
  then raise exception 'Invalid preferences' using errcode='22023';end if;
  update sculpy_private.push_preferences set enabled=(p_data->>'enabled')::boolean,
   new_enquiry=actor.role in ('operations','owner') and (p_data->>'new_enquiry')::boolean,
   overdue=actor.role in ('operations','owner') and (p_data->>'overdue')::boolean,
   itinerary=sculpy_private.itinerary_recipient(p_actor) and coalesce((p_data->>'itinerary')::boolean,prefs.itinerary),
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
  if notice_row.kind='itinerary' then
   select (case when notice_row.itinerary_moment='end' then coalesce(a.agenda_end_local,a.agenda_start_local) else a.agenda_start_local end)::date
      into itinerary_day from public.miranda_schedule a where a.id=notice_row.itinerary_id;
   if not found then raise exception 'Itinerary unavailable' using errcode='42501'; end if;
   return jsonb_build_object('type','itinerary','id',notice_row.itinerary_id,'date',itinerary_day);
  end if;
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

create or replace function sculpy_private.push_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c sculpy_private.push_config; stored text; secret_id uuid; e record; r record; 
 delivery_row sculpy_private.push_deliveries; notice_row sculpy_private.push_notifications; device_row sculpy_private.push_devices; ids jsonb; bucket bigint; delay_seconds integer;
 agenda record; agenda_payload jsonb:='{}';
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
  begin
   perform sculpy_private.enqueue_itinerary_reminders();
  exception when others then
   insert into sculpy_private.push_errors(source,code) values('itinerary-scheduler',sqlstate);
  end;
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
  if notice_row.kind='itinerary' then
   select * into agenda from sculpy_private.current_itinerary_reminder(notice_row);
   if not found then return '{}'::jsonb; end if;
   agenda_payload=jsonb_build_object('itinerary',jsonb_build_object('title',agenda.title,'moment',agenda.moment,
    'alert',agenda.alert,'category',agenda.category,'time',to_char(agenda.local_time,'MM-DD HH24:MI'),
    'zone',agenda.local_zone,'clockTime',to_char(agenda.clock_time,'MM-DD HH24:MI'),'clockZone',agenda.clock_zone,
    'place',agenda.place,'flight',agenda.flight_number,
    'ttl',least(300,greatest(0,floor(extract(epoch from (delivery_row.expires_at-clock_timestamp())))))::integer));
  end if;
  return jsonb_build_object('notification',jsonb_build_object('id',notice_row.id,'kind',notice_row.kind,'title',notice_row.title,'body','请打开 Sculpy 查看。')||agenda_payload,
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

notify pgrst, 'reload schema';
commit;
