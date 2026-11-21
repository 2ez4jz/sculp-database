begin;

-- Until a host has the updated IANA rules, account for Vancouver staying
-- at UTC-7 after March 2026. Newer tzdata continues to decide future rules.
create function sculpy_private.agenda_source_zone(p_local timestamp,p_zone text)
returns text language sql immutable strict set search_path='' as $$
 select case when p_zone in ('America/Vancouver','Canada/Pacific')
  and p_local>=timestamp '2026-03-09'
  and timestamp '2026-12-15 12:00' at time zone 'America/Vancouver' <> timestamptz '2026-12-15 19:00Z'
  then 'Etc/GMT+7' else p_zone end
$$;
revoke all on function sculpy_private.agenda_source_zone(timestamp,text) from public,anon;
grant execute on function sculpy_private.agenda_source_zone(timestamp,text) to authenticated,service_role;

-- Use the same PostgreSQL conversion as the reminder worker, including DST folds.
-- Calendar-only reservations and tasks do not represent instants.
alter table public.miranda_schedule
 add column starts_at timestamptz generated always as (
  case when not all_day then starts_local at time zone sculpy_private.agenda_source_zone(starts_local,start_timezone) end) stored,
 add column ends_at timestamptz generated always as (
  case when not all_day then ends_local at time zone sculpy_private.agenda_source_zone(ends_local,end_timezone) end) stored;

create or replace function public.validate_miranda_schedule() returns trigger
language plpgsql security invoker set search_path='' as $$
declare start_zone text; end_zone text;
begin
 if not public.can_manage_miranda_schedule() then raise exception 'Schedule access denied' using errcode='42501'; end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.start_timezone)
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=new.end_timezone)
 then raise exception 'Invalid timezone' using errcode='22023';end if;
 if not isfinite(new.starts_local) or (new.ends_local is not null and not isfinite(new.ends_local))
 or new.starts_local::date not between date '2000-01-01' and date '2100-12-31'
 or (new.ends_local is not null and new.ends_local::date not between date '2000-01-01' and date '2100-12-31')
 then raise exception 'Invalid date' using errcode='22023';end if;
 if new.all_day then
   if new.ends_local::date < new.starts_local::date then raise exception 'End precedes start' using errcode='22023';end if;
 else
   start_zone:=sculpy_private.agenda_source_zone(new.starts_local,new.start_timezone);
   end_zone:=sculpy_private.agenda_source_zone(new.ends_local,new.end_timezone);
   if (new.starts_local at time zone start_zone) at time zone start_zone <> new.starts_local
   or (new.ends_local is not null and (new.ends_local at time zone end_zone) at time zone end_zone <> new.ends_local)
   then raise exception 'Local time does not exist' using errcode='22023';end if;
   if new.ends_local is not null and new.ends_local at time zone end_zone < new.starts_local at time zone start_zone
   then raise exception 'End precedes start' using errcode='22023';end if;
 end if;
 if tg_op='INSERT' then
   new.version:=1;new.created_by:=auth.uid();new.created_at:=now();
 else
   if new.id<>old.id then raise exception 'Identity is immutable' using errcode='22023';end if;
   new.version:=old.version+1;new.created_by:=old.created_by;new.created_at:=old.created_at;
 end if;
 new.title:=btrim(new.title);new.updated_by:=auth.uid();new.updated_at:=clock_timestamp();
 return new;
end $$;

create or replace function sculpy_private.itinerary_reminders(p_item public.miranda_schedule)
returns table(moment text, alert text, event_at timestamptz, due_at timestamptz, local_time timestamp,
              local_zone text, clock_time timestamp, clock_zone text, place text)
language sql stable set search_path='' as $$
 with moments as (
  select v.*, v.local_time at time zone sculpy_private.agenda_source_zone(v.local_time,v.local_zone) as event_at
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

-- Preserve the existing authorized notification target date for older clients.
-- New clients use the current event instant to open the day on their device.
create or replace function sculpy_private.push_api(p_action text,p_actor uuid,p_session uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; prefs sculpy_private.push_preferences; c sculpy_private.push_config;
 device_row sculpy_private.push_devices; notice_row sculpy_private.push_notifications; sub jsonb; nid uuid; itinerary_day date; itinerary_at timestamptz;
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
   select (case when notice_row.itinerary_moment='end' then coalesce(a.agenda_end_local,a.agenda_start_local) else a.agenda_start_local end)::date,
      case when notice_row.itinerary_moment='end' then coalesce(a.ends_at,a.starts_at) else a.starts_at end
      into itinerary_day,itinerary_at from public.miranda_schedule a where a.id=notice_row.itinerary_id;
   if not found then raise exception 'Itinerary unavailable' using errcode='42501'; end if;
   return jsonb_build_object('type','itinerary','id',notice_row.itinerary_id,'date',itinerary_day,'eventAt',itinerary_at);
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

notify pgrst,'reload schema';
commit;
