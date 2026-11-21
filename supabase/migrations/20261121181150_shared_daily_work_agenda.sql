begin;

create function sculpy_private.shared_daily_work_tasks(p_day date,p_offset integer)
returns table(id uuid,reason text,due_at timestamptz,due_on date,status text,
 edit_version text,assigned_to uuid,assignee text,completed_on date)
language plpgsql stable security definer set search_path='' as $$
declare day_zone text:=case when p_day>=date '2026-11-23' then 'Asia/Shanghai' else 'America/Toronto' end;
begin
 if not public.can_manage_miranda_schedule() then raise exception 'Schedule access denied' using errcode='42501';end if;
 if p_day is null or p_day not between date '2000-01-01' and date '2100-12-31'
  or p_offset is null or p_offset not between 0 and 100000 then raise exception 'Invalid task date' using errcode='22023';end if;
 return query
 select r.id,r.reason,r.due_at,(r.due_at at time zone 'America/Toronto')::date,r.status,
  r.edit_version::text,r.assigned_to,p.display_name,
  case when r.status='done' then (r.updated_at at time zone day_zone)::date end
 from public.reminders r join public.profiles p on p.id=r.assigned_to
 where p.active and ((p.username='sculp_jz' and p.role='operations') or (p.username='sculp_miranda' and p.role='owner'))
  and ((r.status='open' and r.due_at<(p_day+1)::timestamp at time zone 'America/Toronto')
   or (r.status='done' and ((r.due_at at time zone 'America/Toronto')::date=p_day or (r.updated_at at time zone day_zone)::date=p_day)))
 order by r.due_at,r.id limit 100 offset p_offset;
end $$;
revoke all on function sculpy_private.shared_daily_work_tasks(date,integer) from public,anon;
grant execute on function sculpy_private.shared_daily_work_tasks(date,integer) to authenticated;

create function public.sculpy_shared_daily_work_tasks(p_day date,p_offset integer default 0)
returns table(id uuid,reason text,due_at timestamptz,due_on date,status text,
 edit_version text,assigned_to uuid,assignee text,completed_on date)
language sql stable security invoker set search_path='' as $$
 select * from sculpy_private.shared_daily_work_tasks(p_day,p_offset)
$$;
revoke all on function public.sculpy_shared_daily_work_tasks(date,integer) from public,anon;
grant execute on function public.sculpy_shared_daily_work_tasks(date,integer) to authenticated;
notify pgrst,'reload schema';
commit;
