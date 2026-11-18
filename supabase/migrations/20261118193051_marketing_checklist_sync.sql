begin;

-- Shared campaign state. The post and task catalog remains immutable in frontend code.
create table public.marketing_checklist_state (
  campaign text not null default 'holiday-2026' check(campaign='holiday-2026'),
  post_id integer not null check(post_id between 1 and 24),
  task_index integer not null check(task_index between 0 and 50),
  checked boolean not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key(campaign,post_id,task_index)
);
alter table public.marketing_checklist_state enable row level security;
revoke all on public.marketing_checklist_state from public,anon,authenticated;
grant select on public.marketing_checklist_state to authenticated;
create policy marketing_state_admin_read on public.marketing_checklist_state for select to authenticated using((select public.is_business_admin()));

create table public.marketing_task_comments (
  id uuid primary key default gen_random_uuid(),
  campaign text not null default 'holiday-2026' check(campaign='holiday-2026'),
  post_id integer not null check(post_id between 1 and 24),
  task_index integer not null check(task_index between 0 and 50),
  body text not null check(char_length(body) between 1 and 1000),
  author_id uuid not null references public.profiles(id),
  mentioned_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index marketing_task_comments_lookup on public.marketing_task_comments(campaign,post_id,task_index,created_at,id);
alter table public.marketing_task_comments enable row level security;
revoke all on public.marketing_task_comments from public,anon,authenticated;
grant select on public.marketing_task_comments to authenticated;
create policy marketing_comments_admin_read on public.marketing_task_comments for select to authenticated using((select public.is_business_admin()));

create function public.sculpy_marketing_set_check(p_post_id integer,p_task_index integer,p_checked boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); row_state public.marketing_checklist_state;
begin
  if actor is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
  if p_post_id not between 1 and 24 or p_task_index not between 0 and 50 or p_checked is null then raise exception 'Invalid task' using errcode='22023';end if;
  insert into public.marketing_checklist_state(post_id,task_index,checked,updated_by)
  values(p_post_id,p_task_index,p_checked,actor)
  on conflict(campaign,post_id,task_index) do update set checked=excluded.checked,updated_by=actor,updated_at=now()
  returning * into row_state;
  return jsonb_build_object('postId',row_state.post_id,'taskIndex',row_state.task_index,'checked',row_state.checked,'updatedBy',row_state.updated_by,'updatedAt',row_state.updated_at);
end $$;
revoke all on function public.sculpy_marketing_set_check(integer,integer,boolean) from public,anon;
grant execute on function public.sculpy_marketing_set_check(integer,integer,boolean) to authenticated;

-- Extend existing opt-in push pipeline with a non-sensitive marketing mention category.
alter table sculpy_private.push_notifications add column marketing_post_id integer check(marketing_post_id between 1 and 24);
alter table sculpy_private.push_notifications drop constraint push_notifications_kind_check;
alter table sculpy_private.push_notifications add constraint push_notifications_kind_check check(kind in ('new_enquiry','overdue','test','marketing_mention'));

create or replace function sculpy_private.push_can_view(p_recipient uuid,p_kind text,p_enquiry uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 return exists(select 1 from public.profiles p where p.id=p_recipient and p.active and
  (p_kind='test' or p.role in ('operations','owner') and
   (p_kind='marketing_mention' or exists(select 1 from public.website_enquiries e where e.id=p_enquiry and not e.is_test))));
end $$;
create or replace function sculpy_private.push_can_receive(p_recipient uuid,p_kind text,p_enquiry uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare r public.profiles;e public.website_enquiries;
begin
 select * into r from public.profiles where id=p_recipient and active;
 if not found then return false;end if;
 if p_kind='test' then return true;end if;
 if r.role not in ('operations','owner') then return false;end if;
 if p_kind='marketing_mention' then return true;end if;
 select * into e from public.website_enquiries where id=p_enquiry and not is_test;
 if not found then return false;end if;
 if p_kind='new_enquiry' then return e.entry_channel='website' and e.status='pending';end if;
 if p_kind='overdue' then return e.status='pending' and (e.handled_by=p_recipient or not exists(
   select 1 from public.profiles p where p.id=e.handled_by and p.active and p.role in ('operations','owner')));end if;
 return false;
end $$;
create or replace function sculpy_private.push_delivery_allowed(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 return exists(select 1 from sculpy_private.push_deliveries d
 join sculpy_private.push_notifications n on n.id=d.notification_id
 join sculpy_private.push_devices v on v.id=d.device_id
 join sculpy_private.push_preferences p on p.user_id=v.user_id
 join sculpy_private.push_config c on c.id
 where d.id=p_id and c.enabled and v.active and p.enabled and n.recipient_id=v.user_id
 and d.expires_at>now() and sculpy_private.push_session_valid(v.user_id,v.session_id)
 and sculpy_private.push_can_receive(n.recipient_id,n.kind,n.enquiry_id)
 and (n.kind in ('test','marketing_mention') or n.kind='new_enquiry' and p.new_enquiry or n.kind='overdue' and p.overdue));
end $$;
create or replace function sculpy_private.push_enqueue(p_user uuid,p_kind text,p_enquiry uuid,p_event text,p_title text,p_device uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$declare nid uuid;begin
 if not exists(select 1 from sculpy_private.push_config where id and enabled)
 or not sculpy_private.push_can_receive(p_user,p_kind,p_enquiry)
 or not exists(select 1 from sculpy_private.push_preferences p where p.user_id=p_user and p.enabled
 and (p_kind in ('test','marketing_mention') or p_kind='new_enquiry' and p.new_enquiry or p_kind='overdue' and p.overdue))
 then return null;end if;
 if not exists(select 1 from sculpy_private.push_devices v where v.user_id=p_user and v.active
 and (p_device is null or v.id=p_device) and sculpy_private.push_session_valid(v.user_id,v.session_id)) then return null;end if;
 insert into sculpy_private.push_notifications(recipient_id,kind,enquiry_id,event_key,title)
 values(p_user,p_kind,p_enquiry,p_event,p_title) on conflict(event_key) do nothing returning id into nid;
 if nid is null then return null;end if;
 insert into sculpy_private.push_deliveries(notification_id,device_id)
 select nid,v.id from sculpy_private.push_devices v where v.user_id=p_user and v.active
 and (p_device is null or v.id=p_device) and sculpy_private.push_session_valid(v.user_id,v.session_id);
 return nid;
end $$;

create function public.sculpy_marketing_add_comment(p_post_id integer,p_task_index integer,p_body text,p_mentioned_user uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); c public.marketing_task_comments; recipient_name text; notice_id uuid;
begin
 if actor is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 if p_post_id not between 1 and 24 or p_task_index not between 0 and 50 or length(trim(coalesce(p_body,''))) not between 1 and 1000 then raise exception 'Invalid comment' using errcode='22023';end if;
 if p_mentioned_user is not null then
   select display_name into recipient_name from public.profiles where id=p_mentioned_user and active and role in ('owner','operations');
   if recipient_name is null or p_mentioned_user=actor then raise exception 'Mentioned user unavailable' using errcode='22023';end if;
 end if;
 insert into public.marketing_task_comments(post_id,task_index,body,author_id,mentioned_user_id)
 values(p_post_id,p_task_index,trim(p_body),actor,p_mentioned_user) returning * into c;
 if p_mentioned_user is not null then
   notice_id:=sculpy_private.push_enqueue(p_mentioned_user,'marketing_mention',null,'marketing-mention:'||c.id,'有新的社媒任务留言');
   if notice_id is not null then update sculpy_private.push_notifications set marketing_post_id=p_post_id where id=notice_id;end if;
 end if;
 return jsonb_build_object('id',c.id,'postId',c.post_id,'taskIndex',c.task_index,'body',c.body,'authorId',c.author_id,'mentionedUserId',c.mentioned_user_id,'createdAt',c.created_at,'notificationQueued',notice_id is not null);
end $$;
revoke all on function public.sculpy_marketing_add_comment(integer,integer,text,uuid) from public,anon;
grant execute on function public.sculpy_marketing_add_comment(integer,integer,text,uuid) to authenticated;

-- Edge notification handler calls this only after verifying the bearer identity.
create function public.sculpy_marketing_open_notification(p_id uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n sculpy_private.push_notifications;
begin
 select * into n from sculpy_private.push_notifications where id=p_id and recipient_id=p_actor and kind='marketing_mention';
 if not found then return null;end if;
 if not sculpy_private.push_can_view(p_actor,n.kind,n.enquiry_id) then raise exception 'Notification unavailable' using errcode='42501';end if;
 update sculpy_private.push_notifications set read_at=coalesce(read_at,now()) where id=p_id;
 return jsonb_build_object('type','marketing','postId',n.marketing_post_id);
end $$;
revoke all on function public.sculpy_marketing_open_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sculpy_marketing_open_notification(uuid,uuid) to service_role;

commit;
