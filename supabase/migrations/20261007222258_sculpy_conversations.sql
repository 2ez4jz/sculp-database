-- Private projections intentionally avoid granting access to financial columns.
create schema if not exists sculpy_private;
revoke all on schema sculpy_private from public;
grant usage on schema sculpy_private to authenticated;

create table public.sculpy_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 verbosity text not null default 'detailed' check(verbosity in ('brief','balanced','detailed')),
 instructions text not null default '' check(length(instructions)<=1000),
 updated_at timestamptz not null default now()
);
create table public.sculpy_conversations (
 user_id uuid not null references public.profiles(id) on delete cascade,
 scope text not null check(length(scope)<=80),
 turns jsonb not null default '[]' check(jsonb_typeof(turns)='array' and jsonb_array_length(turns)<=100),
 updated_at timestamptz not null default now(),
 primary key(user_id,scope)
);
create table public.sculpy_company_rules (
 id boolean primary key default true check(id),
 content text not null check(length(content)<=8000),
 updated_at timestamptz not null default now()
);
insert into public.sculpy_company_rules values(true,'你是 SCULP Studio 的工作助手 Sculpy。帮助团队查询、解释和记录工作。Miranda 和 Mira 是两位不同成员。遵循当前账号权限。',now());
alter table public.sculpy_preferences enable row level security;
alter table public.sculpy_conversations enable row level security;
alter table public.sculpy_company_rules enable row level security;
create policy preferences_own on public.sculpy_preferences for all to authenticated
 using(user_id=auth.uid() and public.current_app_role() is not null)
 with check(user_id=auth.uid() and public.current_app_role() is not null);
create policy conversations_own on public.sculpy_conversations for all to authenticated
 using(user_id=auth.uid() and public.current_app_role() is not null)
 with check(user_id=auth.uid() and public.current_app_role() is not null);
create policy rules_read on public.sculpy_company_rules for select to authenticated using(public.current_app_role() is not null);
create policy rules_update on public.sculpy_company_rules for update to authenticated using(public.is_business_admin()) with check(public.is_business_admin());
revoke all on public.sculpy_preferences,public.sculpy_conversations,public.sculpy_company_rules from anon,authenticated;
grant select,insert,update,delete on public.sculpy_preferences,public.sculpy_conversations to authenticated;
grant select,update on public.sculpy_company_rules to authenticated;

-- Explicit role + assignment checks and safe field projection; no arbitrary SQL.
create function sculpy_private.context(p_booking_id uuid,p_query text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor uuid:=auth.uid(); admin boolean; allowed_ids jsonb;
begin
 if actor is null or public.current_app_role() is null then raise exception 'Active account required' using errcode='42501'; end if;
 admin:=public.is_business_admin();
 if p_booking_id is not null and not exists(select 1 from public.bookings b where b.id=p_booking_id and b.deleted_at is null and (admin or public.is_assigned_to_booking(b.id))) then
 raise exception 'Order unavailable' using errcode='42501'; end if;
 select coalesce(jsonb_agg(b.id),'[]'::jsonb) into allowed_ids from public.bookings b where b.deleted_at is null and (admin or public.is_assigned_to_booking(b.id));
 with candidates as (
 select b.id,b.starts_at,b.ends_at,b.status,b.updated_at,c.display_name as client,s.name as service,v.name as venue,v.address,
 case when admin then b.price_cad else null end as price_cad,
 coalesce((select jsonb_agg(a.name order by a.name) from public.booking_artists ba join public.artists a on a.id=ba.artist_id where ba.booking_id=b.id),'[]'::jsonb) as artists
 from public.bookings b join public.clients c on c.id=b.client_id left join public.services s on s.id=b.service_id left join public.venues v on v.id=b.venue_id
 where b.deleted_at is null and (admin or public.is_assigned_to_booking(b.id)) and (p_booking_id is null or b.id=p_booking_id)
 and (coalesce(trim(p_query),'')='' or concat_ws(' ',c.display_name,s.name,v.name,b.starts_at::text,b.status::text) ilike '%'||left(p_query,200)||'%' or exists(select 1 from public.booking_artists ba join public.artists a on a.id=ba.artist_id where ba.booking_id=b.id and a.name ilike '%'||left(p_query,200)||'%'))
 ), page as (select * from candidates order by starts_at desc,id limit 30 offset greatest(0,least(coalesce(p_offset,0),100000)))
 select jsonb_build_object('bookings',coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(page))),'[]'::jsonb),'total',(select count(*) from candidates),'offset',greatest(0,coalesce(p_offset,0)),'limit',30) into result from page;
 result:=result||jsonb_build_object('allowedBookingIds',allowed_ids,'actor',jsonb_build_object('id',actor,'name',(select display_name from public.profiles where id=actor),'role',public.current_app_role()),'asOf',now(),'timezone','America/Toronto');
 if p_booking_id is not null then
 result:=result||jsonb_build_object('notes',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,summary,raw_text,created_at from public.work_logs where booking_id=p_booking_id and deleted_at is null order by created_at desc limit 20) x),'[]'::jsonb),
 'records',coalesce((select jsonb_agg(to_jsonb(x)) from (select i.id,i.kind,i.content,i.status,b.created_at from public.context_memory_items i join public.context_memory_batches b on b.id=i.batch_id where i.entity_type='booking' and i.entity_id=p_booking_id and (admin or b.created_by=actor or (i.status='confirmed' and i.kind not in ('task','change'))) order by b.created_at desc limit 30) x),'[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on function sculpy_private.context(uuid,text,integer) from public;
grant execute on function sculpy_private.context(uuid,text,integer) to authenticated;
create function public.sculpy_context(p_booking_id uuid default null,p_query text default '',p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$select sculpy_private.context(p_booking_id,p_query,p_offset)$$;
revoke all on function public.sculpy_context(uuid,text,integer) from public;
grant execute on function public.sculpy_context(uuid,text,integer) to authenticated;
