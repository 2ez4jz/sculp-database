-- V3.1 reuses reminders and client_private. Do not apply unrelated historical
-- migrations to production; this increment has no business-row seed/update.
begin;
alter table public.reminders add column edit_version bigint not null default 1;
create function sculpy_private.os_reminder_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin new.edit_version=old.edit_version+1;return new;end $$;
revoke all on function sculpy_private.os_reminder_revision() from public,anon,authenticated;
create trigger sculpy_os_reminder_revision before update on public.reminders
for each row execute function sculpy_private.os_reminder_revision();

create table sculpy_private.os_task_commands(
 id uuid primary key, actor_id uuid not null references public.profiles(id),
 task_id uuid not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now()
);
alter table sculpy_private.os_task_commands enable row level security;
revoke all on sculpy_private.os_task_commands from public,anon,authenticated;

create function sculpy_private.os_tasks(p_status text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if p_status is null or p_status not in ('open','done','dismissed') or p_offset is null or p_offset<0 or p_offset>100000 then
  raise exception 'Invalid task query' using errcode='22023';end if;
 return jsonb_build_object(
  'total',(select count(*) from public.reminders where status=p_status),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at,t.id) from (
   select r.id,r.reason,r.status,r.due_at,r.edit_version::text,r.client_id,r.booking_id,
    p.display_name as assignee,c.display_name as client,b.order_number
   from public.reminders r left join public.profiles p on p.id=r.assigned_to
    left join public.clients c on c.id=r.client_id and c.deleted_at is null
    left join public.bookings b on b.id=r.booking_id and b.deleted_at is null
   where r.status=p_status order by r.due_at,r.id limit 20 offset p_offset
  )t),'[]'::jsonb));
end $$;
revoke all on function sculpy_private.os_tasks(text,integer) from public,anon,authenticated;
grant execute on function sculpy_private.os_tasks(text,integer) to authenticated;
create function public.sculpy_os_tasks(p_status text default 'open',p_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.os_tasks(p_status,p_offset)$$;
revoke all on function public.sculpy_os_tasks(text,integer) from public,anon,authenticated;
grant execute on function public.sculpy_os_tasks(text,integer) to authenticated;

create function sculpy_private.os_update_task(p_request_id uuid,p_task_id uuid,p_expected_version bigint,p_action text,p_due_on date,p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();old public.reminders;item public.reminders;
 command sculpy_private.os_task_commands;payload jsonb;result jsonb;
begin
 if actor is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if p_confirmed is distinct from true or p_request_id is null or p_task_id is null or p_expected_version is null or p_expected_version<1
  or p_action is null or p_action not in ('complete','cancel','reschedule','reopen') then raise exception 'Invalid confirmed task change' using errcode='22023';end if;
 if p_action='reschedule' then
  if p_due_on is null or not isfinite(p_due_on) or p_due_on<'1900-01-01'::date or p_due_on>'2100-12-31'::date then
   raise exception 'Invalid due date' using errcode='22023';end if;
 elsif p_due_on is not null then raise exception 'Unexpected due date' using errcode='22023';end if;
 payload=jsonb_build_object('task',p_task_id,'version',p_expected_version,'action',p_action,'dueOn',p_due_on);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,31));
 select * into command from sculpy_private.os_task_commands where id=p_request_id;
 if found then
  if command.actor_id is distinct from actor or command.payload is distinct from payload then raise exception 'Request ID conflict' using errcode='23505';end if;
  return command.result||jsonb_build_object('replayed',true);
 end if;
 select * into old from public.reminders where id=p_task_id for update;
 if not found then raise exception 'Task unavailable' using errcode='22023';end if;
 if old.edit_version<>p_expected_version then raise exception 'Task changed; reread before editing' using errcode='40001';end if;
 if (p_action in ('complete','cancel','reschedule') and old.status<>'open') or (p_action='reopen' and old.status='open') then
  raise exception 'Invalid task transition' using errcode='22023';end if;
 update public.reminders set status=case p_action when 'complete' then 'done' when 'cancel' then 'dismissed' when 'reopen' then 'open' else status end,
  due_at=case when p_action='reschedule' then (p_due_on+time '12:00') at time zone 'America/Toronto' else due_at end
 where id=p_task_id returning * into item;
 result=jsonb_build_object('id',item.id,'requestId',p_request_id,'status',item.status,'version',item.edit_version::text,'replayed',false);
 insert into sculpy_private.os_task_commands(id,actor_id,task_id,payload,result) values(p_request_id,actor,p_task_id,payload,result);
 insert into public.audit_events(actor_id,entity_type,entity_id,action,before_value,after_value)
 values(actor,'reminder',item.id,'os_'||p_action,to_jsonb(old),to_jsonb(item));
 return result;
end $$;
revoke all on function sculpy_private.os_update_task(uuid,uuid,bigint,text,date,boolean) from public,anon,authenticated;
grant execute on function sculpy_private.os_update_task(uuid,uuid,bigint,text,date,boolean) to authenticated;
create function public.sculpy_os_update_task(p_request_id uuid,p_task_id uuid,p_expected_version bigint,p_action text,p_due_on date default null,p_confirmed boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.os_update_task(p_request_id,p_task_id,p_expected_version,p_action,p_due_on,p_confirmed)$$;
revoke all on function public.sculpy_os_update_task(uuid,uuid,bigint,text,date,boolean) from public,anon,authenticated;
grant execute on function public.sculpy_os_update_task(uuid,uuid,bigint,text,date,boolean) to authenticated;

create function sculpy_private.os_client_detail(p_client_id uuid,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.clients;
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if p_client_id is null or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid client query' using errcode='22023';end if;
 select * into c from public.clients where id=p_client_id and deleted_at is null;
 if not found then raise exception 'Client unavailable' using errcode='22023';end if;
 return jsonb_build_object(
  'client',jsonb_build_object('id',c.id,'display_name',c.display_name,'preferred_name',c.preferred_name,'referral_source',c.referral_source,
   'city',c.city,'preferred_language',c.preferred_language,'wedding_date',c.wedding_date,'lifecycle_status',c.lifecycle_status),
  'contact',coalesce((select jsonb_build_object('email',email,'phone',phone,'wechat',wechat,'instagram',instagram,'internal_notes',internal_notes) from public.client_private where client_id=c.id),'{}'::jsonb),
  'total',(select count(*) from public.bookings where client_id=c.id and deleted_at is null),
  'bookings',coalesce((select jsonb_agg(to_jsonb(t) order by t.starts_at desc,t.id) from (
   select b.id,b.order_number,b.starts_at,b.status,s.name as service from public.bookings b left join public.services s on s.id=b.service_id
   where b.client_id=c.id and b.deleted_at is null order by b.starts_at desc,b.id limit 20 offset p_offset
  )t),'[]'::jsonb));
end $$;
revoke all on function sculpy_private.os_client_detail(uuid,integer) from public,anon,authenticated;
grant execute on function sculpy_private.os_client_detail(uuid,integer) to authenticated;
create function public.sculpy_os_client_detail(p_client_id uuid,p_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.os_client_detail(p_client_id,p_offset)$$;
revoke all on function public.sculpy_os_client_detail(uuid,integer) from public,anon,authenticated;
grant execute on function public.sculpy_os_client_detail(uuid,integer) to authenticated;

-- Extend the existing customer directory without creating a second CRM store.
create or replace function sculpy_private.os_clients(p_query text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if p_query is null or length(p_query)>160 or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid client query' using errcode='22023';end if;
 return (with matched as (
  select c.id,c.display_name,c.referral_source,c.lifecycle_status,
   (select count(*) from public.bookings b where b.client_id=c.id and b.deleted_at is null) as order_count
  from public.clients c left join public.client_private p on p.client_id=c.id
  where c.deleted_at is null and (p_query='' or strpos(lower(c.display_name),lower(p_query))>0
   or strpos(lower(coalesce(p.email,'')),lower(p_query))>0 or strpos(coalesce(p.phone,''),p_query)>0)
 ),page as (select * from matched order by display_name,id limit 30 offset p_offset)
 select jsonb_build_object('total',(select count(*) from matched),'clients',coalesce((select jsonb_agg(to_jsonb(page) order by display_name,id) from page),'[]'::jsonb)));
end $$;
commit;
