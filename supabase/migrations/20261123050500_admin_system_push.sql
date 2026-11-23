begin;

alter table sculpy_private.push_notifications add column system_workspace boolean not null default true;
create or replace function public.sculpy_active_system_notices() returns table(id uuid,title text,body text,expires_at timestamptz)
language sql stable security definer set search_path='' as $$
 select n.id,n.title,n.system_body,n.system_expires_at
 from sculpy_private.push_notifications n
 where n.recipient_id=(select auth.uid()) and sculpy_private.itinerary_recipient(n.recipient_id)
   and n.system_workspace and n.kind='system_notice' and n.system_expires_at>now()
 order by n.created_at desc
$$;
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
    and (n.kind<>'system_notice' or (n.system_workspace and n.system_expires_at>now()))
   order by n.created_at desc limit 50) x));
 elsif p_action='open' then
  select * into notice_row from sculpy_private.push_notifications where id=(p_data->>'id')::uuid and recipient_id=p_actor;
  if not found or not sculpy_private.push_can_view(p_actor,notice_row.kind,notice_row.enquiry_id) then raise exception 'Notification unavailable' using errcode='42501';end if;
  update sculpy_private.push_notifications set read_at=coalesce(read_at,now()) where id=notice_row.id;
  if notice_row.kind='system_notice' then
   if notice_row.system_expires_at<=now() then raise exception 'Notice expired' using errcode='42501'; end if;
   return jsonb_build_object('type','system_notice');
  end if;
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
  delete from sculpy_private.push_notifications
   where kind='system_notice' and not system_workspace and system_expires_at<=now();
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
  return jsonb_build_object('notification',jsonb_build_object('id',notice_row.id,'kind',notice_row.kind,'title',notice_row.title,'body','请打开 Sculpy 查看。')||agenda_payload||case when notice_row.kind='system_notice' then
     jsonb_build_object('body',notice_row.system_body,'expiresAt',notice_row.system_expires_at,
       'ttl',greatest(0,floor(extract(epoch from (notice_row.system_expires_at-clock_timestamp())))::integer))
     else '{}'::jsonb end,
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

create function public.sculpy_send_system_push(p_request uuid,p_target text,p_title text,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare expires timestamptz:=now()+interval '5 minutes'; results jsonb;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active and username='sculp_jz' and role='operations') then
   raise exception 'JZ administrator required' using errcode='42501';
 end if;
 if p_request is null or p_target is null or p_target not in ('jz','miranda','both')
   or coalesce(char_length(btrim(p_title)),0) not between 1 and 100
   or coalesce(char_length(btrim(p_body)),0) not between 1 and 400 then
   raise exception 'Invalid system push' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-system-push:'||p_request,0));
 if not exists(select 1 from sculpy_private.push_notifications
    where event_key like 'admin-system-push:'||p_request||':%') then
   with recipients as (
     select a.id from public.profiles a
     where sculpy_private.itinerary_recipient(a.id)
       and (p_target='both' or a.username='sculp_'||p_target)
   ), devices as (
     select d.id,d.user_id from recipients a
     join sculpy_private.push_devices d on d.user_id=a.id and d.active
     join sculpy_private.push_preferences p on p.user_id=a.id and p.enabled
     join sculpy_private.push_config c on c.id and c.enabled
     where sculpy_private.push_session_valid(d.user_id,d.session_id)
   ), notices as (
     insert into sculpy_private.push_notifications
       (recipient_id,kind,title,event_key,system_body,system_expires_at,system_workspace)
     select a.id,'system_notice',btrim(p_title),'admin-system-push:'||p_request||':'||a.id,btrim(p_body),expires,false
     from recipients a where exists(select 1 from devices d where d.user_id=a.id)
     returning id,recipient_id
   )
   insert into sculpy_private.push_deliveries(notification_id,device_id,expires_at)
   select n.id,d.id,expires from notices n join devices d on d.user_id=n.recipient_id;
   if found then perform sculpy_private.kick_push_worker(); end if;
 end if;
 select coalesce(jsonb_object_agg(rows.account,rows.devices),'{}'::jsonb) into results
 from (
   select p.username account,count(d.id) devices
   from sculpy_private.push_notifications n
   join public.profiles p on p.id=n.recipient_id
   join sculpy_private.push_deliveries d on d.notification_id=n.id
   where n.event_key like 'admin-system-push:'||p_request||':%'
   group by p.username
 ) rows;
 return results;
end $$;
revoke all on function public.sculpy_send_system_push(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.sculpy_send_system_push(uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
