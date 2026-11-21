begin;

-- Read a month of Miranda's existing work tasks without exposing reminders to
-- the Data API or copying work records into the personal calendar.
create function sculpy_private.miranda_daily_work_tasks(p_from date, p_to date, p_offset integer)
returns table(id uuid, reason text, due_at timestamptz, due_on date, status text,
              edit_version text, assigned_to uuid, assignee text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_manage_miranda_schedule() then
  raise exception 'Schedule access denied' using errcode='42501';
 end if;
 if p_from is null or p_from not between date '2000-01-01' and date '2100-12-31'
    or p_to is null or p_to not between date '2000-01-02' and date '2101-01-01'
    or p_offset is null or p_offset not between 0 and 100000 then
  raise exception 'Invalid work task date range' using errcode='22023';
 end if;
 if p_to - p_from not between 1 and 31 then
  raise exception 'Invalid work task date range' using errcode='22023';
 end if;
 return query
 select r.id, r.reason, r.due_at, (r.due_at at time zone 'America/Toronto')::date,
        r.status::text, r.edit_version::text, r.assigned_to, p.display_name
 from public.reminders r
 join public.profiles p on p.id = r.assigned_to
 where p.username = 'sculp_miranda' and p.role = 'owner' and p.active
   and r.status in ('open', 'done')
   and r.due_at >= p_from::timestamp at time zone 'America/Toronto'
   and r.due_at < p_to::timestamp at time zone 'America/Toronto'
 order by r.due_at, r.id
 limit 100 offset p_offset;
end $$;

create function public.sculpy_miranda_daily_work_tasks(p_from date, p_to date, p_offset integer default 0)
returns table(id uuid, reason text, due_at timestamptz, due_on date, status text,
              edit_version text, assigned_to uuid, assignee text)
language sql stable security invoker set search_path='' as $$
 select * from sculpy_private.miranda_daily_work_tasks(p_from, p_to, p_offset)
$$;

revoke all on function sculpy_private.miranda_daily_work_tasks(date,date,integer) from public,anon,authenticated;
grant execute on function sculpy_private.miranda_daily_work_tasks(date,date,integer) to authenticated;
revoke all on function public.sculpy_miranda_daily_work_tasks(date,date,integer) from public,anon,authenticated;
grant execute on function public.sculpy_miranda_daily_work_tasks(date,date,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
