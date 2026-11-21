begin;

-- One shared personal agenda, restricted to the two existing named accounts.
-- Invoker security deliberately keeps profile RLS and revocation effective.
create function public.can_manage_miranda_schedule() returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active
 and ((p.username='sculp_jz' and p.role='operations') or (p.username='sculp_miranda' and p.role='owner')))
$$;
revoke all on function public.can_manage_miranda_schedule() from public,anon;
grant execute on function public.can_manage_miranda_schedule() to authenticated;

create table public.miranda_schedule (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(btrim(title)) between 1 and 200),
 category text not null check(category in ('flight','hotel','work','todo','personal')),
 starts_local timestamp without time zone not null,
 ends_local timestamp without time zone,
 start_timezone text not null default 'America/Toronto',
 end_timezone text not null default 'America/Toronto',
 all_day boolean not null default false,
 location text not null default '' check(char_length(location)<=500),
 destination text not null default '' check(char_length(destination)<=500),
 flight_number text not null default '' check(char_length(flight_number)<=40),
 reference text not null default '' check(char_length(reference)<=200),
 notes text not null default '' check(char_length(notes)<=5000),
 completed boolean not null default false,
 version bigint not null default 1,
 created_by uuid not null default auth.uid() references public.profiles(id),
 updated_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 first_day date generated always as (least(starts_local::date,ends_local::date)) stored,
 last_day date generated always as (greatest(starts_local::date,ends_local::date)) stored
);
create index miranda_schedule_dates on public.miranda_schedule(first_day,last_day);
alter table public.miranda_schedule enable row level security;
revoke all on public.miranda_schedule from public,anon,authenticated;
grant select,insert,update,delete on public.miranda_schedule to authenticated;
create policy miranda_schedule_select on public.miranda_schedule for select to authenticated
 using ((select public.can_manage_miranda_schedule()));
create policy miranda_schedule_insert on public.miranda_schedule for insert to authenticated
 with check ((select public.can_manage_miranda_schedule()));
create policy miranda_schedule_update on public.miranda_schedule for update to authenticated
 using ((select public.can_manage_miranda_schedule())) with check ((select public.can_manage_miranda_schedule()));
create policy miranda_schedule_delete on public.miranda_schedule for delete to authenticated
 using ((select public.can_manage_miranda_schedule()));

create function public.validate_miranda_schedule() returns trigger
language plpgsql security invoker set search_path='' as $$
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
   if (new.starts_local at time zone new.start_timezone) at time zone new.start_timezone <> new.starts_local
   or (new.ends_local is not null and (new.ends_local at time zone new.end_timezone) at time zone new.end_timezone <> new.ends_local)
   then raise exception 'Local time does not exist' using errcode='22023';end if;
   if new.ends_local is not null and new.ends_local at time zone new.end_timezone < new.starts_local at time zone new.start_timezone
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
revoke all on function public.validate_miranda_schedule() from public,anon,authenticated;
create trigger miranda_schedule_validate before insert or update on public.miranda_schedule
 for each row execute function public.validate_miranda_schedule();

notify pgrst,'reload schema';
commit;
