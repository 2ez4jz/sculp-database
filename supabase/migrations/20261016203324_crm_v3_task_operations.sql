-- Additive V3 task ledger. No demo rows, changes to bookings, or external sends.
create table public.crm_tasks (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete restrict,
 title text not null check(length(trim(title)) between 1 and 300),
 due_on date,
 status text not null default 'open' check(status in ('open','done','dismissed')),
 source_key text unique,
 revision integer not null default 1,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index crm_tasks_booking on public.crm_tasks(booking_id);
create index crm_tasks_creator on public.crm_tasks(created_by);
create index crm_tasks_due on public.crm_tasks(due_on) where status='open';
create table public.crm_commands (
 request_id uuid primary key,
 actor_id uuid not null references public.profiles(id),
 action text not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
create index crm_commands_actor on public.crm_commands(actor_id);
alter table public.crm_tasks enable row level security;
alter table public.crm_commands enable row level security;
revoke all on public.crm_tasks,public.crm_commands from public,anon,authenticated;
grant select on public.crm_tasks,public.crm_commands to authenticated;
create policy crm_tasks_admin_read on public.crm_tasks for select to authenticated using(public.is_business_admin());
create policy crm_commands_admin_read on public.crm_commands for select to authenticated using(public.is_business_admin());
create function sculpy_private.crm_command(p_request_id uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.crm_commands; item public.crm_tasks; before_item jsonb; result jsonb; actor uuid:=auth.uid(); local_today date:=(now() at time zone 'America/Toronto')::date; n integer;
begin
 if actor is null or not public.is_business_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if p_request_id is null or p_payload is null or p_payload->>'confirmed' is distinct from 'true' then raise exception 'Explicit confirmation required';end if;
 -- Serialize equal request IDs so a network retry cannot duplicate a side effect.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into old from public.crm_commands where request_id=p_request_id;
 if found then
  if old.actor_id<>actor or old.action<>p_action or old.payload<>p_payload then raise exception 'Request ID conflict' using errcode='23505';end if;
  return old.result||jsonb_build_object('replayed',true);
 end if;
 if p_action='create_task' then
  if (p_payload-'confirmed'-'bookingId'-'title'-'dueOn')<>'{}'::jsonb then raise exception 'Unsupported fields';end if;
  if not exists(select 1 from public.bookings b where b.id=(p_payload->>'bookingId')::uuid and b.deleted_at is null) then raise exception 'Booking not found';end if;
  if jsonb_typeof(p_payload->'title')<>'string' then raise exception 'Title required';end if;
  if p_payload->>'dueOn' is not null and ((p_payload->>'dueOn') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or to_char((p_payload->>'dueOn')::date,'YYYY-MM-DD')<>p_payload->>'dueOn') then raise exception 'Invalid due date';end if;
  insert into public.crm_tasks(booking_id,title,due_on,created_by) values((p_payload->>'bookingId')::uuid,trim(p_payload->>'title'),(p_payload->>'dueOn')::date,actor) returning * into item;
  result:=to_jsonb(item);
 elsif p_action='update_task' then
  if (p_payload-'confirmed'-'id'-'revision'-'status')<>'{}'::jsonb or p_payload->>'status' not in ('open','done','dismissed') or p_payload->>'status' is null then raise exception 'Invalid task update';end if;
  select * into item from public.crm_tasks where id=(p_payload->>'id')::uuid for update;
  if not found or item.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Task version changed' using errcode='40001';end if;
  before_item:=to_jsonb(item);
  update public.crm_tasks set status=p_payload->>'status',revision=revision+1,updated_at=now() where id=item.id returning * into item;
  result:=to_jsonb(item);
 elsif p_action='run_workflows' then
  if p_payload<>'{"confirmed":true}'::jsonb then raise exception 'Workflow scope is server controlled';end if;
  -- Stable source key: a completed/dismissed task does not re-enroll accidentally.
  with inserted as (
   insert into public.crm_tasks(booking_id,title,due_on,source_key,created_by)
   select b.id,'核对即将开始的服务安排',local_today,'service-prep:'||b.id::text||':'||to_char(b.starts_at at time zone 'America/Toronto','YYYY-MM-DD'),actor
   from public.bookings b where b.deleted_at is null and b.status='confirmed'
    and (b.starts_at at time zone 'America/Toronto')::date between local_today and local_today+1
   on conflict(source_key) do nothing returning id
  ) select count(*) into n from inserted;
  result:=jsonb_build_object('created',n,'asOf',local_today,'scope','internal_service_preparation_only');
 else raise exception 'Unsupported CRM action';end if;
 insert into public.crm_commands(request_id,actor_id,action,payload,result) values(p_request_id,actor,p_action,p_payload,result);
 insert into public.audit_events(actor_id,entity_type,entity_id,action,before_value,after_value) values(actor,'crm_task',case when p_action='run_workflows' then null else item.id end,p_action,before_item,result);
 return result||jsonb_build_object('replayed',false);
end $$;
revoke all on function sculpy_private.crm_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function sculpy_private.crm_command(uuid,text,jsonb) to authenticated;
create function public.sculpy_crm_command(p_request_id uuid,p_action text,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.crm_command(p_request_id,p_action,p_payload)$$;
revoke all on function public.sculpy_crm_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.sculpy_crm_command(uuid,text,jsonb) to authenticated;
