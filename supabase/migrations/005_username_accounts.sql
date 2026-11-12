-- Existing accounts are not silently renamed: an operator must explicitly map
-- their Auth identifier and username before switching them to username login.
alter table public.profiles add column username text unique
 check (username ~ '^sculp_[a-z0-9][a-z0-9_]{0,25}$');
drop function public.list_managed_accounts();
create function public.list_managed_accounts()
returns table(id uuid, display_name text, username text, role public.app_role, active boolean)
language plpgsql security definer set search_path=public
as $$ begin
 if public.current_app_role() is distinct from 'operations'::public.app_role then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 return query select p.id,p.display_name,p.username,p.role,p.active
 from public.profiles p order by p.created_at,p.id;
end $$;
revoke all on function public.list_managed_accounts() from public,anon;
grant execute on function public.list_managed_accounts() to authenticated;

-- Auth user creation is performed by the Edge Function; profile and audit are atomic.
create function public.provision_managed_account(p_actor uuid,p_id uuid,p_username text,p_display_name text,p_role public.app_role)
returns void language plpgsql security definer set search_path=public
as $$ begin
 if not exists(select 1 from public.profiles where id=p_actor and active and role='operations') then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if p_username is null or p_username !~ '^sculp_[a-z0-9][a-z0-9_]{0,25}$'
 or p_display_name is null or length(trim(p_display_name)) not between 1 and 80 or p_role is null then
  raise exception 'Invalid account information';
 end if;
 if not exists(select 1 from auth.users where id=p_id and email=p_username||'@accounts.sculp.invalid') then
  raise exception 'Account identifier mismatch';
 end if;
 insert into public.profiles(id,username,display_name,role,active)
 values(p_id,p_username,trim(p_display_name),p_role,true);
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_value)
 values(p_actor,'profiles',p_id,'account_create',jsonb_build_object('username',p_username,'role',p_role));
end $$;
revoke all on function public.provision_managed_account(uuid,uuid,text,text,public.app_role) from public,anon,authenticated;
grant execute on function public.provision_managed_account(uuid,uuid,text,text,public.app_role) to service_role;
