-- Phase 1 is additive. Apply only after reviewing production schema drift and backup.
-- Reuse reminders; do not require the unreleased crm_tasks migration.
begin;
-- TRUNCATE bypasses RLS and is never a browser capability.
revoke truncate,references,trigger on public.reminders from anon,authenticated;

create function sculpy_private.os_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare day date:=(now() at time zone 'America/Toronto')::date;
 week_start date:=date_trunc('week',now() at time zone 'America/Toronto')::date;
 result jsonb;
begin
 if auth.uid() is null or not public.is_business_admin() then
  raise exception 'Business administrator required' using errcode='42501';
 end if;
 select jsonb_build_object(
  'asOf',now(),'today',day,'timezone','America/Toronto',
  'pendingEnquiries',(select count(*) from public.website_enquiries where status='pending' and not is_test),
  'todayTasks',(select count(*) from public.reminders where status='open' and (due_at at time zone 'America/Toronto')::date=day),
  'overdueTasks',(select count(*) from public.reminders where status='open' and (due_at at time zone 'America/Toronto')::date<day),
  'weekBookings',(select count(*) from public.bookings where deleted_at is null and status='confirmed'
    and starts_at >= week_start::timestamp at time zone 'America/Toronto'
    and starts_at < (week_start+7)::timestamp at time zone 'America/Toronto'),
  'unfinishedOrders',(select count(*) from public.bookings where deleted_at is null and status in ('inquiry','confirmed')),
  'receivableCents',(select sculpy_private.cents(sum(greatest(sculpy_private.contract_value(b.id)-coalesce(
    (select sum(case when p.payment_kind='refund' then -p.amount else p.amount end) from public.payments p
     join public.invoices i on i.id=p.invoice_id where i.booking_id=b.id and p.currency='CAD'
      and p.status in ('succeeded','refunded','partially_refunded') and p.paid_at<=now()),0),0)))
    from public.bookings b where b.deleted_at is null and b.contract_role='contract' and b.status in ('confirmed','completed') and b.currency='CAD'),
  'receivableUnknown',(select count(*) from public.bookings b where b.deleted_at is null and b.contract_role='contract'
    and b.status in ('confirmed','completed') and (b.currency<>'CAD' or sculpy_private.contract_value(b.id) is null)),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by due_at,id) from
    (select id,reason,due_at,booking_id,client_id,assigned_to,status from public.reminders
     where status='open' order by due_at,id limit 20)t),'[]'::jsonb),
  'taskCount',(select count(*) from public.reminders where status='open'),
  'followups',coalesce((select jsonb_agg(to_jsonb(t) order by last_contact_at nulls first,first_contact_at,id) from
    (select id,name,status,event_date,last_contact_at,first_contact_at from public.website_enquiries
     where not is_test and status in ('pending','contacted','qualified','quoted')
     order by last_contact_at nulls first,first_contact_at,id limit 10)t),'[]'::jsonb),
  'followupCount',(select count(*) from public.website_enquiries where not is_test and status in ('pending','contacted','qualified','quoted')),
  'upcoming',coalesce((select jsonb_agg(to_jsonb(t) order by starts_at,id) from
    (select b.id,b.order_number,b.starts_at,b.status,c.display_name as client
     from public.bookings b join public.clients c on c.id=b.client_id
     where b.deleted_at is null and c.deleted_at is null and b.status in ('inquiry','confirmed')
      and b.starts_at >= day::timestamp at time zone 'America/Toronto'
     order by b.starts_at,b.id limit 10)t),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function sculpy_private.os_overview() from public,anon,authenticated;
grant execute on function sculpy_private.os_overview() to authenticated;
create function public.sculpy_os_overview() returns jsonb language sql security invoker set search_path=''
as $$select sculpy_private.os_overview()$$;
revoke all on function public.sculpy_os_overview() from public,anon,authenticated;
grant execute on function public.sculpy_os_overview() to authenticated;

create function sculpy_private.os_clients(p_query text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if p_query is null or length(p_query)>160 or p_offset is null or p_offset<0 or p_offset>100000 then
  raise exception 'Invalid client query' using errcode='22023';end if;
 return (with matched as (
  select c.id,c.display_name,c.referral_source,c.lifecycle_status,
   (select count(*) from public.bookings b where b.client_id=c.id and b.deleted_at is null) as order_count
  from public.clients c where c.deleted_at is null and (p_query='' or strpos(lower(c.display_name),lower(p_query))>0)
 ), page as (select * from matched order by display_name,id limit 30 offset p_offset)
 select jsonb_build_object('total',(select count(*) from matched),'clients',coalesce((select jsonb_agg(to_jsonb(page) order by display_name,id) from page),'[]'::jsonb)));
end $$;
revoke all on function sculpy_private.os_clients(text,integer) from public,anon,authenticated;
grant execute on function sculpy_private.os_clients(text,integer) to authenticated;
create function public.sculpy_os_clients(p_query text default '',p_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.os_clients(p_query,p_offset)$$;
revoke all on function public.sculpy_os_clients(text,integer) from public,anon,authenticated;
grant execute on function public.sculpy_os_clients(text,integer) to authenticated;

-- UUID is generated once by the browser and retained until an acknowledged result.
-- A replay must match actor and original input. No direct table grants are added.
create function sculpy_private.os_create_task(p_id uuid,p_title text,p_due_at timestamptz,p_booking_id uuid,p_client_id uuid,p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.reminders; linked uuid;
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if p_confirmed is distinct from true or p_id is null or p_title is null or length(trim(p_title)) not between 1 and 300
  or p_due_at is null or not isfinite(p_due_at) then raise exception 'Check task title, time and confirmation' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into old from public.reminders where id=p_id;
 if found then
  if old.source is distinct from 'sculp-os:'||auth.uid()::text or old.reason is distinct from trim(p_title)
   or old.due_at is distinct from p_due_at or old.booking_id is distinct from p_booking_id or old.client_id is distinct from p_client_id
   then raise exception 'Request ID conflict' using errcode='23505';end if;
  return jsonb_build_object('id',old.id,'replayed',true);
 end if;
 if p_client_id is not null and not exists(select 1 from public.clients where id=p_client_id and deleted_at is null) then
  raise exception 'Client unavailable' using errcode='22023';end if;
 if p_booking_id is not null then
  select client_id into linked from public.bookings where id=p_booking_id and deleted_at is null;
  if not found or (p_client_id is not null and linked<>p_client_id) then raise exception 'Booking/client mismatch' using errcode='22023';end if;
 end if;
 insert into public.reminders(id,reason,due_at,booking_id,client_id,assigned_to,source)
 values(p_id,trim(p_title),p_due_at,p_booking_id,p_client_id,auth.uid(),'sculp-os:'||auth.uid()::text);
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_value)
 values(auth.uid(),'reminder',p_id,'create',jsonb_build_object('title',trim(p_title),'due_at',p_due_at,'booking_id',p_booking_id,'client_id',p_client_id));
 return jsonb_build_object('id',p_id,'replayed',false);
end $$;
revoke all on function sculpy_private.os_create_task(uuid,text,timestamptz,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function sculpy_private.os_create_task(uuid,text,timestamptz,uuid,uuid,boolean) to authenticated;
create function public.sculpy_os_create_task(p_id uuid,p_title text,p_due_at timestamptz,p_booking_id uuid default null,p_client_id uuid default null,p_confirmed boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.os_create_task(p_id,p_title,p_due_at,p_booking_id,p_client_id,p_confirmed)$$;
revoke all on function public.sculpy_os_create_task(uuid,text,timestamptz,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.sculpy_os_create_task(uuid,text,timestamptz,uuid,uuid,boolean) to authenticated;

-- Standalone client creation does not guess matches or merge existing clients.
create function sculpy_private.os_create_client(p_id uuid,p_name text,p_source text,p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.clients;
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if p_confirmed is distinct from true or p_id is null or p_name is null or length(trim(p_name)) not between 1 and 160
  or length(coalesce(p_source,''))>100 then raise exception 'Check client name, source and confirmation' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into old from public.clients where id=p_id;
 if found then
  if old.created_by is distinct from auth.uid() or old.display_name is distinct from trim(p_name)
   or old.referral_source is distinct from nullif(trim(p_source),'') or old.deleted_at is not null then raise exception 'Request ID conflict' using errcode='23505';end if;
  return jsonb_build_object('id',p_id,'replayed',true);
 end if;
 -- Serialize equal names as well as request IDs to avoid racing duplicate creates.
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_name)),1));
 -- Same-name clients are a possible duplicate, not automatically the same person.
 if exists(select 1 from public.clients where deleted_at is null and lower(display_name)=lower(trim(p_name))) then
  raise exception 'Possible duplicate client: review existing client before creating' using errcode='23505';end if;
 insert into public.clients(id,display_name,referral_source,lifecycle_status,created_by)
 values(p_id,trim(p_name),nullif(trim(p_source),''),'lead',auth.uid());
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_value)
 values(auth.uid(),'client',p_id,'create',jsonb_build_object('display_name',trim(p_name),'referral_source',nullif(trim(p_source),'')));
 return jsonb_build_object('id',p_id,'replayed',false);
end $$;
revoke all on function sculpy_private.os_create_client(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function sculpy_private.os_create_client(uuid,text,text,boolean) to authenticated;
create function public.sculpy_os_create_client(p_id uuid,p_name text,p_source text default '',p_confirmed boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.os_create_client(p_id,p_name,p_source,p_confirmed)$$;
revoke all on function public.sculpy_os_create_client(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.sculpy_os_create_client(uuid,text,text,boolean) to authenticated;
commit;
