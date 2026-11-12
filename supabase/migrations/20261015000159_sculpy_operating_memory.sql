-- Business policy memory is admin-only. No customer/order data is copied here.
create table public.sculpy_operating_memory (
 id uuid primary key default gen_random_uuid(),
 content text not null check(length(trim(content)) between 1 and 2000),
 status text not null default 'pending' check(status in ('pending','active','superseded','revoked')),
 revision integer not null default 1,
 supersedes_id uuid references public.sculpy_operating_memory(id),
 created_by uuid not null references public.profiles(id),
 confirmed_by uuid references public.profiles(id),
 confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status not in ('active','superseded') or confirmed_by is not null)
);
create index sculpy_memory_active_updated on public.sculpy_operating_memory(status,updated_at desc);
create index sculpy_memory_creator on public.sculpy_operating_memory(created_by);
create index sculpy_memory_confirmer on public.sculpy_operating_memory(confirmed_by);
create index sculpy_memory_supersedes on public.sculpy_operating_memory(supersedes_id);
create table public.sculpy_memory_audit (
 id bigint generated always as identity primary key,
 memory_id uuid not null references public.sculpy_operating_memory(id),
 actor_id uuid not null references public.profiles(id),
 action text not null,
 snapshot jsonb not null,
 created_at timestamptz not null default now()
);
create index sculpy_memory_audit_memory on public.sculpy_memory_audit(memory_id);
create index sculpy_memory_audit_actor on public.sculpy_memory_audit(actor_id);
alter table public.sculpy_operating_memory enable row level security;
alter table public.sculpy_memory_audit enable row level security;
create policy memory_admin_read on public.sculpy_operating_memory for select to authenticated using(public.is_business_admin());
create policy memory_audit_admin_read on public.sculpy_memory_audit for select to authenticated using(public.is_business_admin());
revoke all on public.sculpy_operating_memory,public.sculpy_memory_audit from public,anon,authenticated;
grant select on public.sculpy_operating_memory,public.sculpy_memory_audit to authenticated;
-- Privileged writes live only in the private schema and verify the active role.
create function sculpy_private.manage_operating_memory(p_action text,p_id uuid,p_revision integer,p_content text,p_supersedes uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.sculpy_operating_memory; old_item public.sculpy_operating_memory;
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_action='propose' then
  if p_supersedes is not null then
   select * into old_item from public.sculpy_operating_memory where id=p_supersedes for update;
   if not found or old_item.status<>'active' then raise exception 'Original memory is no longer active'; end if;
  end if;
  insert into public.sculpy_operating_memory(id,content,created_by,supersedes_id) values(p_id,trim(p_content),auth.uid(),p_supersedes) returning * into item;
 elsif p_action in ('confirm','revoke') then
  select * into item from public.sculpy_operating_memory where id=p_id for update;
  if not found or item.revision<>p_revision then raise exception 'Memory changed; reload before confirming' using errcode='40001'; end if;
  if p_action='confirm' then
   if item.status<>'pending' then raise exception 'Only pending memory can be confirmed'; end if;
   if item.supersedes_id is not null then
    select * into old_item from public.sculpy_operating_memory where id=item.supersedes_id for update;
    if old_item.status<>'active' then raise exception 'Original memory changed; review correction again'; end if;
    update public.sculpy_operating_memory set status='superseded',revision=revision+1,updated_at=now() where id=old_item.id returning * into old_item;
    insert into public.sculpy_memory_audit(memory_id,actor_id,action,snapshot) values(old_item.id,auth.uid(),'supersede',to_jsonb(old_item));
   end if;
   update public.sculpy_operating_memory set status='active',confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now(),revision=revision+1 where id=p_id returning * into item;
  else
   if item.status not in ('active','pending') then raise exception 'Memory is already inactive'; end if;
   update public.sculpy_operating_memory set status='revoked',updated_at=now(),revision=revision+1 where id=p_id returning * into item;
  end if;
 else raise exception 'Unsupported memory action'; end if;
 insert into public.sculpy_memory_audit(memory_id,actor_id,action,snapshot) values(item.id,auth.uid(),p_action,to_jsonb(item));
 return to_jsonb(item);
end $$;
revoke all on function sculpy_private.manage_operating_memory(text,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function sculpy_private.manage_operating_memory(text,uuid,integer,text,uuid) to authenticated;
create function public.sculpy_manage_memory(p_action text,p_id uuid,p_revision integer default null,p_content text default null,p_supersedes uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.manage_operating_memory(p_action,p_id,p_revision,p_content,p_supersedes)$$;
revoke all on function public.sculpy_manage_memory(text,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.sculpy_manage_memory(text,uuid,integer,text,uuid) to authenticated;
create function public.sculpy_search_memory(p_query text default '') returns jsonb
language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from (
 select id,content,confirmed_at,revision from public.sculpy_operating_memory
 where status='active' and public.is_business_admin()
 order by (case when trim(coalesce(p_query,''))<>'' and content ilike '%'||left(p_query,200)||'%' then 1 else 0 end) desc,updated_at desc,id limit 20
) m $$;
revoke all on function public.sculpy_search_memory(text) from public,anon,authenticated;
grant execute on function public.sculpy_search_memory(text) to authenticated;
