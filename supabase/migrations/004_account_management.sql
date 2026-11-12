-- Jz is provisioned as operations by a project administrator, never by display name.
-- No browser may write profiles directly or self-promote.
revoke insert, update, delete on public.profiles from anon, authenticated;

create or replace function public.list_managed_accounts()
returns table(id uuid, display_name text, email text, role public.app_role, active boolean)
language plpgsql security definer set search_path=public
as $$ begin
 if public.current_app_role() is distinct from 'operations'::public.app_role then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 return query select p.id,p.display_name,u.email::text,p.role,p.active
 from public.profiles p join auth.users u on u.id=p.id order by p.created_at,p.id;
end $$;

create or replace function public.update_managed_account(p_id uuid,p_display_name text,p_role public.app_role,p_active boolean)
returns void language plpgsql security definer set search_path=public
as $$
declare previous public.profiles;
begin
 -- Serialize account mutations so two administrators cannot remove each other's access concurrently.
 perform pg_advisory_xact_lock(713042);
 if public.current_app_role() is distinct from 'operations'::public.app_role then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if p_display_name is null or length(trim(p_display_name)) not between 1 and 80 or p_role is null or p_active is null then
  raise exception 'Invalid account information';
 end if;
 if p_id=auth.uid() and (p_role<>'operations' or not p_active) then
  raise exception 'Cannot remove own administrator access';
 end if;
 select * into previous from public.profiles where profiles.id=p_id for update;
 if not found then raise exception 'Account not found'; end if;
 update public.profiles set display_name=trim(p_display_name),role=p_role,active=p_active where profiles.id=p_id;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,before_value,after_value)
 values(auth.uid(),'profiles',p_id,'account_update',to_jsonb(previous),
 jsonb_build_object('display_name',trim(p_display_name),'role',p_role,'active',p_active));
end $$;
revoke all on function public.list_managed_accounts() from public,anon;
revoke all on function public.update_managed_account(uuid,text,public.app_role,boolean) from public,anon;
grant execute on function public.list_managed_accounts() to authenticated;
grant execute on function public.update_managed_account(uuid,text,public.app_role,boolean) to authenticated;
-- Assigned-record checks must also reject a disabled profile with an existing JWT.
create or replace function public.current_artist_id() returns uuid
language sql stable security definer set search_path=public
as $$ select a.id from public.artists a join public.profiles p on p.id=a.profile_id
 where a.profile_id=auth.uid() and a.employment_status='active' and p.active $$;
