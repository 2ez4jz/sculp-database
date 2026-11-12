-- Human-facing references. UUIDs and legacy booking_number remain unchanged.
alter table public.bookings add column order_number text;
create unique index bookings_order_number_idx on public.bookings(order_number);

create function sculpy_private.order_service_digit(p_code text) returns text
language sql immutable security invoker set search_path='' as $$
 select case lower(p_code)
  when 'wedding' then '1' when 'trial' then '2' when 'event' then '3'
  when 'photoshoot' then '5' when 'commercial' then '6' when 'education' then '7'
  when 'personal' then '8' else '0' end
$$;
revoke all on function sculpy_private.order_service_digit(text) from public,anon,authenticated;

create function sculpy_private.assign_order_number() returns trigger
language plpgsql volatile security invoker set search_path='' as $$
declare category text; prefix text; candidate text; suffix text; value integer; start_value integer; attempt integer;
begin
 if tg_op='UPDATE' and old.order_number is not null then
  if new.order_number is distinct from old.order_number then
   raise exception '订单号建立后不能修改。' using errcode='22023';
  end if;
  if new.service_id is distinct from old.service_id then
   if sculpy_private.order_service_digit((select code from public.services where id=new.service_id)) <> substr(old.order_number,2,1) then
    raise exception '不能更改单号对应的服务分类，请另建订单。' using errcode='22023';
   end if;
  end if;
  return new;
 end if;
 if tg_op='INSERT' and new.order_number is not null then
  raise exception '订单号由系统自动生成。' using errcode='22023';
 end if;
 category:=sculpy_private.order_service_digit((select code from public.services where id=new.service_id));
 prefix:='6'||category;
 -- Serialize allocation per category; unique index remains the final safeguard.
 perform pg_advisory_xact_lock(hashtextextended('sculpy-order-number:'||category,0));
 start_value:=floor(random()*6561)::integer;
 for attempt in 0..6560 loop
  value:=(start_value+attempt)%6561; suffix:='';
  for digit in 1..4 loop
   suffix:=substr('012356789',value%9+1,1)||suffix; value:=value/9;
  end loop;
  candidate:=prefix||suffix;
  if not exists(select 1 from public.bookings where order_number=candidate) then
   new.order_number:=candidate; return new;
  end if;
 end loop;
 raise exception '这类服务的六位单号已用完，请联系管理员扩展编号。' using errcode='54000';
end $$;
revoke all on function sculpy_private.assign_order_number() from public,anon,authenticated;
create trigger assign_order_number before insert or update on public.bookings
for each row execute function sculpy_private.assign_order_number();

-- Backfill once, retaining all relationships and historical internal references.
do $$ declare booking_id uuid; begin
 for booking_id in select id from public.bookings where order_number is null order by created_at,id loop
  update public.bookings set order_number=null where id=booking_id;
 end loop;
end $$;
alter table public.bookings alter column order_number set not null;
alter table public.bookings add constraint bookings_order_number_format
 check(order_number ~ '^6[01235678][012356789]{4}$');

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
 select b.id,b.order_number,b.starts_at,b.ends_at,b.status,b.updated_at,c.display_name as client,s.name as service,coalesce(v.name,b.preparation_address) as venue,v.address,b.service_details,
 case when admin then b.budget_cad else null end as budget_cad,
 case when admin then b.price_cad else null end as price_cad,
 coalesce((select jsonb_agg(a.name order by a.name) from public.booking_artists ba join public.artists a on a.id=ba.artist_id where ba.booking_id=b.id),'[]'::jsonb) as artists
 from public.bookings b join public.clients c on c.id=b.client_id left join public.services s on s.id=b.service_id left join public.venues v on v.id=b.venue_id
 where b.deleted_at is null and (admin or public.is_assigned_to_booking(b.id)) and (p_booking_id is null or b.id=p_booking_id)
 and (coalesce(trim(p_query),'')='' or concat_ws(' ',b.order_number,c.display_name,s.name,v.name,b.preparation_address,(b.starts_at at time zone 'America/Toronto')::text,b.status::text) ilike '%'||left(p_query,200)||'%' or exists(select 1 from public.booking_artists ba join public.artists a on a.id=ba.artist_id where ba.booking_id=b.id and a.name ilike '%'||left(p_query,200)||'%'))
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
