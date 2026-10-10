-- Canonical records are accessed through explicit, role-checked projections/RPCs.
-- Supabase's default table grants must not expose whole rows (including money)
-- or let browser writes bypass confirmation, version checks and request replay.
revoke all on public.bookings, public.clients, public.client_private,
 public.booking_artists, public.booking_services, public.artist_compensations,
 public.services, public.venues, public.partners,
 public.invoices, public.payments, public.booking_financials,
 public.service_revenue_monthly from public, anon, authenticated;

alter table public.bookings add column edit_version bigint not null default 1;
create function sculpy_private.bump_booking_version() returns trigger
language plpgsql set search_path='' as $$
begin new.edit_version := old.edit_version + 1; return new; end $$;
revoke all on function sculpy_private.bump_booking_version() from public, anon, authenticated;
create trigger bump_booking_version before update on public.bookings
for each row execute function sculpy_private.bump_booking_version();

create table public.booking_changes (
 request_id uuid primary key,
 booking_id uuid not null references public.bookings(id),
 created_by uuid not null references public.profiles(id),
 expected_version bigint not null,
 confirmed_payload jsonb not null,
 reason text not null check(length(trim(reason)) between 1 and 2000),
 before_value jsonb not null,
 after_value jsonb not null,
 created_at timestamptz not null default now()
);
create index booking_changes_booking_idx on public.booking_changes(booking_id, created_at desc);
alter table public.booking_changes enable row level security;
create policy booking_changes_read_operations on public.booking_changes for select
to authenticated using ((select public.is_system_admin()));
revoke all on public.booking_changes from public, anon, authenticated;
grant select on public.booking_changes to authenticated;

-- Return editor fields only to current business administrators. The AI context
-- projection remains unchanged and receives neither source text nor new grants.
create function sculpy_private.order_detail(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; b public.bookings;
begin
 if p_booking_id is null then raise exception '请选择订单。' using errcode='22023'; end if;
 result := sculpy_private.context(p_booking_id,'',0);
 if public.is_business_admin() then
  select * into b from public.bookings where id=p_booking_id and deleted_at is null;
  result := result || jsonb_build_object('edit', jsonb_build_object(
   'version', b.edit_version, 'date', to_char(b.starts_at at time zone 'America/Toronto','YYYY-MM-DD'),
   'time', to_char(b.starts_at at time zone 'America/Toronto','HH24:MI'),
   'endDate', coalesce(to_char(b.ends_at at time zone 'America/Toronto','YYYY-MM-DD'),''),
   'endTime', coalesce(to_char(b.ends_at at time zone 'America/Toronto','HH24:MI'),''),
   'location', coalesce((select name from public.venues where id=b.venue_id), b.preparation_address,''),
   'details', coalesce(b.service_details,''), 'status', b.status));
 end if;
 return result;
end $$;
revoke all on function sculpy_private.order_detail(uuid) from public, anon;
grant execute on function sculpy_private.order_detail(uuid) to authenticated;
create or replace function public.sculpy_order_detail(p_booking_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select sculpy_private.order_detail(p_booking_id)
$$;

create function sculpy_private.local_booking_time(p_date text,p_time text) returns timestamptz
language plpgsql stable set search_path='' as $$
declare local_value timestamp; instant timestamptz;
begin
 if p_date is null or p_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
 or p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
  raise exception '请填写有效日期与时间（2000–2099年）。' using errcode='22023';
 end if;
 local_value := p_date::date + p_time::time;
 instant := local_value at time zone 'America/Toronto';
 if instant at time zone 'America/Toronto' <> local_value
 or (instant-interval '1 hour') at time zone 'America/Toronto'=local_value
 or (instant+interval '1 hour') at time zone 'America/Toronto'=local_value then
  raise exception '此时间处于夏令时切换区间，请核实后另行安排。' using errcode='22023';
 end if;
 return instant;
end $$;
revoke all on function sculpy_private.local_booking_time(text,text) from public, anon, authenticated;

create function sculpy_private.confirm_booking_change(
 p_request_id uuid,p_booking_id uuid,p_expected_version bigint,p_payload jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous public.bookings; updated public.bookings;
 prior public.booking_changes; start_time timestamptz; end_time timestamptz;
 new_status public.booking_status; location text; old_location text;
begin
 if actor is null or not public.is_business_admin() then
  raise exception '仅管理员可修改订单。' using errcode='42501';
 end if;
 if p_request_id is null or p_booking_id is null or p_expected_version is null
 or p_expected_version < 1 or p_payload is null or jsonb_typeof(p_payload)<>'object'
 or p_reason is null or length(trim(p_reason)) not between 1 and 2000 then
  raise exception '请保留有效修改请求与修改原因。' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('booking-change:'||p_request_id::text,0));
 select * into prior from public.booking_changes where request_id=p_request_id;
 if found then
  if prior.created_by<>actor or prior.booking_id<>p_booking_id
  or prior.expected_version<>p_expected_version or prior.confirmed_payload<>p_payload
  or prior.reason is distinct from p_reason then
   raise exception '请求已使用，请重新核对。' using errcode='23505';
  end if;
  return jsonb_build_object('bookingId',prior.booking_id,'version',prior.after_value->'edit_version','replayed',true);
 end if;
 if (select count(*) from jsonb_object_keys(p_payload))<>8
 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
 ('date','time','endDate','endTime','location','details','status','confirmed'))
 or exists(select 1 from jsonb_each(p_payload) e where e.key<>'confirmed' and jsonb_typeof(e.value)<>'string')
 or p_payload->'confirmed' is distinct from 'true'::jsonb then
  raise exception '请核对并明确确认修改，不支持金额或其他字段。' using errcode='22023';
 end if;
 if length(p_payload->>'location')>500 or length(p_payload->>'details')>2000 then
  raise exception '地点或服务需求过长。' using errcode='22023';
 end if;
 start_time:=sculpy_private.local_booking_time(p_payload->>'date',p_payload->>'time');
 if (p_payload->>'endDate'='') <> (p_payload->>'endTime'='') then
  raise exception '结束日期与时间须同时填写或同时留空。' using errcode='22023';
 end if;
 if p_payload->>'endDate'<>'' then
  end_time:=sculpy_private.local_booking_time(p_payload->>'endDate',p_payload->>'endTime');
  if end_time<=start_time then raise exception '结束时间须晚于开始时间。' using errcode='22023'; end if;
 end if;
 if p_payload->>'status' not in ('inquiry','confirmed','completed','cancelled') then
  raise exception '订单状态无效。' using errcode='22023';
 end if;
 new_status:=(p_payload->>'status')::public.booking_status;
 select * into previous from public.bookings where id=p_booking_id and deleted_at is null for update;
 if not found then raise exception '订单不存在或已删除。' using errcode='22023'; end if;
 if previous.edit_version<>p_expected_version then
  raise exception '另一窗口已修改订单，请重新读取并核对。' using errcode='40001';
 end if;
 -- Minute-resolution editor must not truncate untouched imported timestamps.
 if p_payload->>'date'=to_char(previous.starts_at at time zone 'America/Toronto','YYYY-MM-DD')
 and p_payload->>'time'=to_char(previous.starts_at at time zone 'America/Toronto','HH24:MI') then
  start_time:=previous.starts_at;
 end if;
 if previous.ends_at is not null
 and p_payload->>'endDate'=to_char(previous.ends_at at time zone 'America/Toronto','YYYY-MM-DD')
 and p_payload->>'endTime'=to_char(previous.ends_at at time zone 'America/Toronto','HH24:MI') then
  end_time:=previous.ends_at;
 end if;
 if end_time is not null and end_time<=start_time then
  raise exception '结束时间须晚于开始时间。' using errcode='22023';
 end if;
 -- Completed/cancelled orders must first be explicitly reopened to inquiry.
 if (previous.status in ('completed','cancelled') and new_status not in (previous.status,'inquiry'))
 or (previous.status='inquiry' and new_status='completed') then
  raise exception '请先重新打开或确认订单，再更新状态。' using errcode='22023';
 end if;
 -- Match intake's duplicate lock/key so editing cannot race new intake.
 perform pg_advisory_xact_lock(hashtextextended('booking:'||previous.client_id::text||':'||(p_payload->>'date')||':'||coalesce(previous.service_id::text,''),0));
 if new_status<>'cancelled' and exists(select 1 from public.bookings b
  where b.id<>p_booking_id and b.client_id=previous.client_id
  and b.service_id is not distinct from previous.service_id and b.deleted_at is null
  and b.status<>'cancelled' and (b.starts_at at time zone 'America/Toronto')::date=(p_payload->>'date')::date) then
  raise exception '该客户当天已有同类订单，请核对，避免重复。' using errcode='23505';
 end if;
 location:=nullif(trim(p_payload->>'location'),'');
 old_location:=coalesce((select name from public.venues where id=previous.venue_id),previous.preparation_address);
 update public.bookings set starts_at=start_time,ends_at=end_time,status=new_status,
  preparation_address=case when location is distinct from old_location then location else preparation_address end,
  venue_id=case when location is distinct from old_location then null else venue_id end,
  service_details=nullif(trim(p_payload->>'details'),''),
  confirmed_at=case when new_status='confirmed' and previous.status<>new_status then now() when new_status='inquiry' then null else confirmed_at end,
  completed_at=case when new_status='completed' and previous.status<>new_status then now() when new_status<>'completed' then null else completed_at end,
  cancelled_at=case when new_status='cancelled' and previous.status<>new_status then now() when new_status<>'cancelled' then null else cancelled_at end
 where id=p_booking_id returning * into updated;
 insert into public.booking_changes(request_id,booking_id,created_by,expected_version,confirmed_payload,reason,before_value,after_value)
 values(p_request_id,p_booking_id,actor,p_expected_version,p_payload,p_reason,to_jsonb(previous),to_jsonb(updated));
 return jsonb_build_object('bookingId',updated.id,'version',updated.edit_version,'replayed',false);
end $$;
revoke all on function sculpy_private.confirm_booking_change(uuid,uuid,bigint,jsonb,text) from public, anon;
grant execute on function sculpy_private.confirm_booking_change(uuid,uuid,bigint,jsonb,text) to authenticated;
create function public.sculpy_confirm_booking_change(p_request_id uuid,p_booking_id uuid,p_expected_version bigint,p_payload jsonb,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$
 select sculpy_private.confirm_booking_change(p_request_id,p_booking_id,p_expected_version,p_payload,p_reason)
$$;
revoke all on function public.sculpy_confirm_booking_change(uuid,uuid,bigint,jsonb,text) from public, anon;
grant execute on function public.sculpy_confirm_booking_change(uuid,uuid,bigint,jsonb,text) to authenticated;

-- All amounts are integer CAD cents serialized as strings: no floating-point
-- arithmetic. Service month and receipt month are independent Toronto ranges.
-- Refund statuses preserve original receipt amount; net receipts cannot be
-- computed without dated refund transactions, which this schema does not have.
create function sculpy_private.monthly_report(p_month text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare from_time timestamptz; to_time timestamptz; result jsonb;
begin
 if auth.uid() is null or not public.is_business_admin() then
  raise exception '仅管理员可查看经营月报。' using errcode='42501';
 end if;
 if p_month is null or p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then
  raise exception '月份须为 YYYY-MM（2000–2099年）。' using errcode='22023';
 end if;
 from_time:=(p_month||'-01')::timestamp at time zone 'America/Toronto';
 to_time:=((p_month||'-01')::timestamp+interval '1 month') at time zone 'America/Toronto';
 with scoped as (
  select b.*,coalesce((select sum(bs.line_total) from public.booking_services bs where bs.booking_id=b.id),b.price_cad) as completed_value
  from public.bookings b where b.deleted_at is null and b.starts_at>=from_time and b.starts_at<to_time
 ), receipts as (
  select p.* from public.payments p join public.invoices i on i.id=p.invoice_id
  join public.bookings b on b.id=i.booking_id
  where i.deleted_at is null and b.deleted_at is null and p.paid_at>=from_time and p.paid_at<to_time
  and p.status in ('succeeded','refunded','partially_refunded')
 ) select jsonb_build_object(
  'month',p_month,'timezone','America/Toronto','asOf',now(),
  'bookings',jsonb_build_object(
   'total',(select count(*) from scoped where status<>'cancelled'),
   'inquiry',(select count(*) from scoped where status='inquiry'),
   'confirmed',(select count(*) from scoped where status='confirmed'),
   'completed',(select count(*) from scoped where status='completed'),
   'cancelled',(select count(*) from scoped where status='cancelled'),
   'completedAmountCents',(select (coalesce(sum(completed_value),0)*100)::numeric(30,0)::text from scoped where status='completed' and currency='CAD'),
   'unpriced',(select count(*) from scoped where status='completed' and completed_value is null),
   'nonCadCompleted',(select count(*) from scoped where status='completed' and currency<>'CAD')),
  'receipts',jsonb_build_object(
   'grossAmountCents',(select (coalesce(sum(amount),0)*100)::numeric(30,0)::text from receipts where currency='CAD'),
   'count',(select count(*) from receipts where currency='CAD'),
   'refundReviewCount',(select count(*) from receipts where status in ('refunded','partially_refunded')),
   'nonCadCount',(select count(*) from receipts where currency<>'CAD')),
  'undatedReceiptCount',(select count(*) from public.payments p join public.invoices i on i.id=p.invoice_id join public.bookings b on b.id=i.booking_id
   where i.deleted_at is null and b.deleted_at is null and p.status in ('succeeded','refunded','partially_refunded') and p.paid_at is null)
 ) into result;
 return result;
end $$;
revoke all on function sculpy_private.monthly_report(text) from public, anon;
grant execute on function sculpy_private.monthly_report(text) to authenticated;
create function public.sculpy_monthly_report(p_month text) returns jsonb
language sql stable security invoker set search_path='' as $$ select sculpy_private.monthly_report(p_month) $$;
revoke all on function public.sculpy_monthly_report(text) from public, anon;
grant execute on function public.sculpy_monthly_report(text) to authenticated;
