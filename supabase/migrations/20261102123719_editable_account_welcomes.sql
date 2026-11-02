-- Additive: existing account RPCs, roles and RLS remain unchanged.
alter table public.profiles
 add column welcome_message text not null default '' check (char_length(welcome_message) <= 160),
 add column welcome_revision bigint not null default 0 check (welcome_revision >= 0);

-- Preserve the greeting explicitly requested before cloud editing was available.
update public.profiles
 set welcome_message='欢迎最美化妆师Miranda亲临工作室指导工作', welcome_revision=1
 where username='sculp_miranda';

create function public.list_account_welcomes()
returns table(id uuid, display_name text, username text, welcome_message text, welcome_revision bigint)
language plpgsql security definer set search_path=''
as $$ begin
 if public.current_app_role() is distinct from 'operations'::public.app_role then
  raise exception 'System administrator access required' using errcode='42501';
 end if;
 return query select p.id,p.display_name,p.username,p.welcome_message,p.welcome_revision
 from public.profiles p order by p.created_at,p.id;
end $$;

create function public.set_account_welcome(p_id uuid,p_message text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare previous public.profiles; next_message text;
begin
 -- Serialize with existing role/deactivation commands; recheck the active actor.
 perform pg_catalog.pg_advisory_xact_lock(713042);
 if public.current_app_role() is distinct from 'operations'::public.app_role then
  raise exception 'System administrator access required' using errcode='42501';
 end if;
 if p_id is null or p_message is null or char_length(p_message)>160 or p_revision is null or p_revision<0 then
  raise exception 'Invalid welcome message' using errcode='22023';
 end if;
 next_message=pg_catalog.btrim(p_message,E' \n\r\t');
 select * into previous from public.profiles p where p.id=p_id for update;
 if not found then raise exception 'Account not found' using errcode='P0002'; end if;
 -- A lost-acknowledgement retry of an already-applied value is a harmless no-op.
 if previous.welcome_message=next_message then
  return jsonb_build_object('id',p_id,'welcome_message',previous.welcome_message,'welcome_revision',previous.welcome_revision);
 end if;
 if previous.welcome_revision<>p_revision then
  raise exception 'Welcome message changed; reload before saving' using errcode='40001';
 end if;
 update public.profiles set welcome_message=next_message,welcome_revision=welcome_revision+1 where id=p_id;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,before_value,after_value)
 values(auth.uid(),'profiles',p_id,'welcome_update',
  jsonb_build_object('welcome_message',previous.welcome_message,'welcome_revision',previous.welcome_revision),
  jsonb_build_object('welcome_message',next_message,'welcome_revision',previous.welcome_revision+1));
 return jsonb_build_object('id',p_id,'welcome_message',next_message,'welcome_revision',previous.welcome_revision+1);
end $$;
revoke all on function public.list_account_welcomes() from public,anon;
revoke all on function public.set_account_welcome(uuid,text,bigint) from public,anon;
grant execute on function public.list_account_welcomes() to authenticated;
grant execute on function public.set_account_welcome(uuid,text,bigint) to authenticated;
