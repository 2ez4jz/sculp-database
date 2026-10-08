-- Reviewed, atomic cloud intake. Private definer functions deliberately own writes:
-- callers receive no direct write grants that could bypass validation/idempotency.
alter table public.bookings add column budget_cad numeric(10,2) check(budget_cad >= 0), add column service_details text;
create table public.booking_intakes (
 request_id uuid primary key,
 created_by uuid not null references public.profiles(id),
 booking_id uuid not null unique references public.bookings(id),
 client_id uuid not null references public.clients(id),
 raw_text text not null check(length(raw_text) between 1 and 12000),
 recorded_at timestamptz not null,
 created_at timestamptz not null default now(),
 confirmed_payload jsonb not null
);
create index booking_intakes_author_idx on public.booking_intakes(created_by);
create index booking_intakes_client_idx on public.booking_intakes(client_id);
alter table public.booking_intakes enable row level security;
create policy intake_admin_read on public.booking_intakes for select to authenticated using((select public.is_business_admin()));
revoke all on public.booking_intakes from public,anon,authenticated;
grant select on public.booking_intakes to authenticated;
create index clients_intake_name_idx on public.clients(lower(trim(display_name))) where deleted_at is null;
create index bookings_intake_duplicate_idx on public.bookings(client_id,service_id,starts_at) where deleted_at is null;

create function sculpy_private.intake_lookup(p_name text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception '仅管理员可录入订单。' using errcode='42501'; end if;
 return jsonb_build_object(
 'clients',coalesce((select jsonb_agg(to_jsonb(c)) from (select id,display_name,city from public.clients where deleted_at is null and lower(trim(display_name))=lower(trim(left(p_name,100))) order by created_at limit 30)c),'[]'::jsonb),
 'artists',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,name,employment_status from public.artists where member_type='artist' and employment_status<>'inactive' order by name)a),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(to_jsonb(s)) from (select id,code,name from public.services where active order by name)s),'[]'::jsonb));
end $$;
revoke all on function sculpy_private.intake_lookup(text) from public;
grant execute on function sculpy_private.intake_lookup(text) to authenticated;
create function public.sculpy_intake_lookup(p_name text default '') returns jsonb language sql stable security invoker set search_path='' as $$ select sculpy_private.intake_lookup(p_name) $$;
revoke all on function public.sculpy_intake_lookup(text) from public;
grant execute on function public.sculpy_intake_lookup(text) to authenticated;

create function sculpy_private.confirm_intake(p_request_id uuid,p_payload jsonb,p_raw_text text,p_recorded_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior public.booking_intakes; cid uuid; bid uuid; sid uuid; aid uuid; n text; local_start timestamp; start_time timestamptz; budget numeric; answer jsonb;
begin
 if actor is null or not public.is_business_admin() then raise exception '仅管理员可录入订单。' using errcode='42501'; end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '录入请求无效。'; end if;
 -- Serialize retries, including different sessions after a lost response.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.booking_intakes where request_id=p_request_id;
 if found then
  if prior.created_by<>actor or prior.confirmed_payload<>p_payload or prior.raw_text is distinct from p_raw_text or prior.recorded_at is distinct from p_recorded_at then raise exception '请求已使用，请核对已保存订单。' using errcode='23505'; end if;
  return jsonb_build_object('bookingId',prior.booking_id,'clientId',prior.client_id,'savedAt',prior.created_at,'replayed',true);
 end if;
 if p_raw_text is null or length(trim(p_raw_text))=0 or length(p_raw_text)>12000 or p_recorded_at is null or not isfinite(p_recorded_at) or p_recorded_at>now()+interval '5 minutes' then raise exception '请保留有效原文与录入时间。'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('clientId','clientName','city','date','time','serviceId','artistId','location','details','budget')) then raise exception '包含不支持的字段。'; end if;
 if exists(select 1 from jsonb_each(p_payload) e where jsonb_typeof(e.value)<>'string') then raise exception '字段格式无效。'; end if;
 n:=trim(p_payload->>'clientName');
 if n is null or length(n) not between 2 and 100 or length(coalesce(p_payload->>'city',''))>100 or length(coalesce(p_payload->>'location',''))>500 or length(coalesce(p_payload->>'details',''))>2000 then raise exception '请核对客户姓名与字段长度。'; end if;
 if coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_payload->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '请补齐完整年份、日期和开始时间。'; end if;
 local_start:=(p_payload->>'date')::date+(p_payload->>'time')::time;
 start_time:=local_start at time zone 'America/Toronto';
 -- Reject DST skipped and repeated local hours rather than guessing an instant.
 if start_time at time zone 'America/Toronto'<>local_start or (start_time-interval '1 hour') at time zone 'America/Toronto'=local_start or (start_time+interval '1 hour') at time zone 'America/Toronto'=local_start then raise exception '此时间处于夏令时切换区间，请核实后另行安排。'; end if;
 sid:=nullif(p_payload->>'serviceId','')::uuid;
 aid:=nullif(p_payload->>'artistId','')::uuid;
 if sid is null or not exists(select 1 from public.services where id=sid and active) then raise exception '请选择有效服务类型。'; end if;
 if aid is not null and not exists(select 1 from public.artists where id=aid and member_type='artist' and employment_status<>'inactive') then raise exception '化妆师不可分配。'; end if;
 if nullif(p_payload->>'budget','') is not null then
  if (p_payload->>'budget') !~ '^\d{1,8}(\.\d{1,2})?$' then raise exception '预算须为非负金额，最多两位小数。'; end if;
  budget:=(p_payload->>'budget')::numeric;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('client:'||lower(n),0));
 cid:=nullif(p_payload->>'clientId','')::uuid;
 if cid is null then
  if exists(select 1 from public.clients where lower(trim(display_name))=lower(n) and deleted_at is null) then raise exception '已有同名客户，请重新查找并明确选择。' using errcode='23505'; end if;
  insert into public.clients(display_name,city,lifecycle_status,created_by) values(n,nullif(trim(p_payload->>'city'),''),'lead',actor) returning id into cid;
 else
  if not exists(select 1 from public.clients where id=cid and deleted_at is null and lower(trim(display_name))=lower(n)) then raise exception '客户资料已变化，请重新查找。'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('booking:'||cid::text||':'||(p_payload->>'date')||':'||sid::text,0));
 if exists(select 1 from public.bookings where client_id=cid and service_id=sid and (starts_at at time zone 'America/Toronto')::date=local_start::date and deleted_at is null and status<>'cancelled') then raise exception '该客户当天已有同类订单，请先核对，避免重复。' using errcode='23505'; end if;
 insert into public.bookings(client_id,service_id,starts_at,preparation_address,service_details,budget_cad,source,created_by)
 values(cid,sid,start_time,nullif(trim(p_payload->>'location'),''),nullif(trim(p_payload->>'details'),''),budget,'sculpy_text',actor) returning id into bid;
 if aid is not null then insert into public.booking_artists(booking_id,artist_id) values(bid,aid); end if;
 insert into public.booking_intakes(request_id,created_by,booking_id,client_id,raw_text,recorded_at,confirmed_payload)
 values(p_request_id,actor,bid,cid,p_raw_text,p_recorded_at,p_payload);
 return jsonb_build_object('bookingId',bid,'clientId',cid,'savedAt',now(),'replayed',false);
end $$;
revoke all on function sculpy_private.confirm_intake(uuid,jsonb,text,timestamptz) from public;
grant execute on function sculpy_private.confirm_intake(uuid,jsonb,text,timestamptz) to authenticated;
create function public.sculpy_confirm_intake(p_request_id uuid,p_payload jsonb,p_raw_text text,p_recorded_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.confirm_intake(p_request_id,p_payload,p_raw_text,p_recorded_at)$$;
revoke all on function public.sculpy_confirm_intake(uuid,jsonb,text,timestamptz) from public;
grant execute on function public.sculpy_confirm_intake(uuid,jsonb,text,timestamptz) to authenticated;

create or replace function sculpy_private.context(p_booking_id uuid,p_query text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor uuid:=auth.uid(); admin boolean; allowed_ids jsonb;
begin
 if actor is null or public.current_app_role() is null then raise exception 'Active account required' using errcode='42501'; end if;
 admin:=public.is_business_admin();
 if p_booking_id is not null and not exists(select 1 from public.bookings b where b.id=p_booking_id and b.deleted_at is null and (admin or public.is_assigned_to_booking(b.id))) then
 raise exception 'Order unavailable' using errcode='42501'; end if;
 select coalesce(jsonb_agg(b.id),'[]'::jsonb) into allowed_ids from public.bookings b where b.deleted_at is null and (admin or public.is_assigned_to_booking(b.id));
 with candidates as (
 select b.id,b.starts_at,b.ends_at,b.status,b.updated_at,c.display_name as client,s.name as service,coalesce(v.name,b.preparation_address) as venue,v.address,b.service_details,
 case when admin then b.budget_cad else null end as budget_cad,
 case when admin then b.price_cad else null end as price_cad,
 coalesce((select jsonb_agg(a.name order by a.name) from public.booking_artists ba join public.artists a on a.id=ba.artist_id where ba.booking_id=b.id),'[]'::jsonb) as artists
 from public.bookings b join public.clients c on c.id=b.client_id left join public.services s on s.id=b.service_id left join public.venues v on v.id=b.venue_id
 where b.deleted_at is null and (admin or public.is_assigned_to_booking(b.id)) and (p_booking_id is null or b.id=p_booking_id)
 and (coalesce(trim(p_query),'')='' or concat_ws(' ',c.display_name,s.name,v.name,b.preparation_address,(b.starts_at at time zone 'America/Toronto')::text,b.status::text) ilike '%'||left(p_query,200)||'%' or exists(select 1 from public.booking_artists ba join public.artists a on a.id=ba.artist_id where ba.booking_id=b.id and a.name ilike '%'||left(p_query,200)||'%'))
 ), page as (select * from candidates order by starts_at desc,id limit 30 offset greatest(0,least(coalesce(p_offset,0),100000)))
 select jsonb_build_object('bookings',coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(page))),'[]'::jsonb),'total',(select count(*) from candidates),'offset',greatest(0,coalesce(p_offset,0)),'limit',30) into result from page;
 result:=result||jsonb_build_object('allowedBookingIds',allowed_ids,'actor',jsonb_build_object('id',actor,'name',(select display_name from public.profiles where id=actor),'role',public.current_app_role()),'asOf',now(),'timezone','America/Toronto');
 if p_booking_id is not null then
 result:=result||jsonb_build_object('notes',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,summary,raw_text,created_at from public.work_logs where booking_id=p_booking_id and deleted_at is null order by created_at desc limit 20) x),'[]'::jsonb),
 'records',coalesce((select jsonb_agg(to_jsonb(x)) from (select i.id,i.kind,i.content,i.status,b.created_at from public.context_memory_items i join public.context_memory_batches b on b.id=i.batch_id where i.entity_type='booking' and i.entity_id=p_booking_id and (admin or b.created_by=actor or (i.status='confirmed' and i.kind not in ('task','change'))) order by b.created_at desc limit 30) x),'[]'::jsonb));
 end if;
 if admin and p_booking_id is not null then
 result:=result||jsonb_build_object('intake',(select jsonb_build_object('rawText',raw_text,'recordedAt',recorded_at,'savedAt',created_at,'authorId',created_by) from public.booking_intakes where booking_id=p_booking_id));
 end if;
 return result;
end $$;

-- Public directory labels only. No login accounts, client seeds or default prices.
insert into public.services(code,name) values
 ('wedding','Wedding Day Styling'),('trial','Wedding Trial'),('event','Event Styling'),('personal','Personal Styling'),('commercial','Commercial Beauty'),('photoshoot','Photoshoot Styling'),('education','Education')
on conflict(code) do nothing;
insert into public.artists(slug,name,level,employment_status) values
 ('miranda','Miranda','Signature','profile_only'),('yuki','Yuki','Director','profile_only'),('mira','Mira','Director','profile_only'),('angelina','Angelina','Senior','profile_only'),('elaine','Elaine','Senior','profile_only'),('emily','Emily','Senior','profile_only'),('michelle','Michelle','Styling','profile_only'),('giselle','Giselle','Senior','profile_only')
on conflict(slug) do nothing;

-- Role helpers must be callable by policies, but never by anonymous callers.
revoke execute on function public.current_app_role(),public.current_artist_id(),public.is_assigned_to_booking(uuid),public.is_business_admin(),public.is_staff_manager(),public.is_system_admin() from public,anon;
grant execute on function public.current_app_role(),public.current_artist_id(),public.is_assigned_to_booking(uuid),public.is_business_admin(),public.is_staff_manager(),public.is_system_admin() to authenticated,service_role;
revoke execute on function public.write_audit_event() from public,anon,authenticated;
do $$begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  execute 'revoke execute on function public.rls_auto_enable() from public,anon,authenticated';
 end if;
end$$;
