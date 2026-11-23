begin;

alter table sculpy_private.push_notifications
  add column agenda_comment_id uuid references public.miranda_day_comments(id) on delete cascade,
  drop constraint push_notifications_kind_check,
  add constraint push_notifications_kind_check
    check(kind in ('new_enquiry','overdue','test','marketing_mention','itinerary','agenda_mention')),
  add constraint push_notifications_agenda_comment_check
    check((kind='agenda_mention') = (agenda_comment_id is not null));

create function sculpy_private.enqueue_agenda_mention() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not sculpy_private.itinerary_recipient(new.mentioned_user_id) then return new; end if;
  with devices as (
    select d.id from sculpy_private.push_devices d
    join sculpy_private.push_preferences p on p.user_id=d.user_id and p.enabled
    join sculpy_private.push_config c on c.id and c.enabled
    where d.user_id=new.mentioned_user_id and d.active
      and sculpy_private.push_session_valid(d.user_id,d.session_id)
  ), notice as (
    insert into sculpy_private.push_notifications(recipient_id,kind,title,event_key,agenda_comment_id)
    select new.mentioned_user_id,'agenda_mention','有人在日程留言中 @ 你','agenda-mention:'||new.id,new.id
    where exists(select 1 from devices)
    on conflict(event_key) do nothing returning id
  )
  insert into sculpy_private.push_deliveries(notification_id,device_id)
  select notice.id,devices.id from notice cross join devices;
  if found then perform sculpy_private.kick_push_worker(); end if;
  return new;
end $$;
revoke all on function sculpy_private.enqueue_agenda_mention() from public,anon,authenticated;
create trigger agenda_comment_push after insert on public.miranda_day_comments
  for each row when (new.mentioned_user_id is not null)
  execute function sculpy_private.enqueue_agenda_mention();

create or replace function sculpy_private.push_can_view(p_recipient uuid,p_kind text,p_enquiry uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 return exists(select 1 from public.profiles p where p.id=p_recipient and p.active and
  (p_kind='test' or p_kind in ('itinerary','agenda_mention') and sculpy_private.itinerary_recipient(p_recipient) or p.role in ('operations','owner') and
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
  or n.kind='agenda_mention' and sculpy_private.itinerary_recipient(n.recipient_id)
   and exists(select 1 from public.miranda_day_comments c
     where c.id=n.agenda_comment_id and c.mentioned_user_id=n.recipient_id and c.read_at is null)
  or sculpy_private.push_can_receive(n.recipient_id,n.kind,n.enquiry_id)
   and (n.kind in ('test','marketing_mention') or n.kind='new_enquiry' and p.new_enquiry or n.kind='overdue' and p.overdue)
 ));
end $$;

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
  if notice_row.kind='agenda_mention' then
   select agenda_day into itinerary_day from public.miranda_day_comments
     where id=notice_row.agenda_comment_id and mentioned_user_id=p_actor;
   if not found then raise exception 'Comment unavailable' using errcode='42501'; end if;
   return jsonb_build_object('type','agenda_mention','id',notice_row.agenda_comment_id,'date',itinerary_day);
  end if;
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
