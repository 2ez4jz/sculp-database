-- Contextual annotations. Does not overwrite canonical financial/order fields.
-- Apply only after 001 and 002, in a private staging project first.
create table public.context_memory_batches (
 id uuid primary key,
 entity_type text not null check(entity_type in ('booking','client','artist','venue','partner')),
 entity_id uuid not null,
 raw_text text not null check(length(raw_text) between 1 and 4000),
 input_type text not null check(input_type in ('text','voice')),
 created_by uuid not null references public.profiles(id),
 draft_id uuid references public.ai_drafts(id),
 created_at timestamptz not null default now()
);
create table public.context_memory_items (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.context_memory_batches(id) on delete cascade,
 entity_type text not null check(entity_type in ('booking','client','artist','venue','partner')),
 entity_id uuid not null,
 kind text not null check(kind in ('note','preference','experience','task','change')),
 content text not null check(length(content) between 1 and 4000),
 due_date date,
 assigned_artist_id uuid references public.artists(id),
 status text not null check(status in ('confirmed','pending_review')),
 position integer not null
);
create index context_memory_entity_idx on public.context_memory_items(entity_type,entity_id);
alter table public.context_memory_batches enable row level security;
alter table public.context_memory_items enable row level security;

create function public.can_record_context(p_type text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare allowed boolean := false;
begin
 if auth.uid() is null or public.current_app_role() is null then return false; end if;
 if public.current_app_role() not in ('owner','operations','artist') then return false; end if;
 case p_type
 when 'booking' then select exists(select 1 from public.bookings b where b.id=p_id and b.deleted_at is null and (public.is_business_admin() or public.is_assigned_to_booking(b.id))) into allowed;
 when 'client' then select public.is_business_admin() and exists(select 1 from public.clients where id=p_id and deleted_at is null) into allowed;
 when 'artist' then select exists(select 1 from public.artists where id=p_id and (public.is_business_admin() or id=public.current_artist_id())) into allowed;
 when 'venue' then select exists(select 1 from public.venues where id=p_id) and (public.is_business_admin() or exists(select 1 from public.bookings b where b.venue_id=p_id and b.deleted_at is null and public.is_assigned_to_booking(b.id))) into allowed;
 when 'partner' then select exists(select 1 from public.partners where id=p_id) and (public.is_business_admin() or exists(select 1 from public.booking_partners bp join public.bookings b on b.id=bp.booking_id where bp.partner_id=p_id and b.deleted_at is null and public.is_assigned_to_booking(b.id))) into allowed;
 else return false;
 end case;
 return coalesce(allowed,false);
end $$;
revoke all on function public.can_record_context(text,uuid) from public;
grant execute on function public.can_record_context(text,uuid) to authenticated;

create policy context_batches_read on public.context_memory_batches for select to authenticated using (
 public.current_app_role() is not null and (public.is_business_admin() or created_by=auth.uid() or
 (entity_type='booking' and public.can_record_context(entity_type,entity_id)))
);
create policy context_items_read on public.context_memory_items for select to authenticated using (
 exists(select 1 from public.context_memory_batches b where b.id=batch_id and
 (public.is_business_admin() or b.created_by=auth.uid() or (status='confirmed' and kind not in ('task','change'))))
);
-- Clients cannot insert/update annotations or forge creator/status/audit columns.
revoke all on public.context_memory_batches,public.context_memory_items from anon,authenticated;
grant select on public.context_memory_batches,public.context_memory_items to authenticated;

create function public.save_context_memory(p_request_id uuid,p_entity_type text,p_entity_id uuid,p_raw_text text,p_input_type text,p_items jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 actor uuid := auth.uid(); existing public.context_memory_batches; proposal uuid;
 item jsonb; target_type text; target_id uuid; item_kind text; item_text text;
 assigned uuid; item_status text; n integer := 0; related boolean;
begin
 if not public.can_record_context(p_entity_type,p_entity_id) then raise exception 'Not allowed to record here' using errcode='42501'; end if;
 if p_request_id is null or p_input_type is null or p_input_type not in ('text','voice') or p_raw_text is null or length(trim(p_raw_text)) not between 1 and 4000 then raise exception 'Invalid recording'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Items must be an array'; end if;
 if jsonb_array_length(p_items) not between 1 and 16 then raise exception 'Choose 1-16 items'; end if;
 -- Serializes retries for this request ID; transaction failure leaves no partial writes.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into existing from public.context_memory_batches where id=p_request_id;
 if found then
  if existing.created_by<>actor then raise exception 'Request ID unavailable' using errcode='42501'; end if;
  return jsonb_build_object('id',existing.id,'replayed',true);
 end if;
 insert into public.ai_drafts(created_by,booking_id,input_type,raw_input,proposed_changes,status,reviewed_by,reviewed_at)
 values(actor,case when p_entity_type='booking' then p_entity_id else null end,p_input_type,p_raw_text,p_items,'confirmed',actor,now()) returning id into proposal;
 insert into public.context_memory_batches(id,entity_type,entity_id,raw_text,input_type,created_by,draft_id)
 values(p_request_id,p_entity_type,p_entity_id,p_raw_text,p_input_type,actor,proposal);
 for item in select value from jsonb_array_elements(p_items) loop
  target_type:=item->>'entityType'; target_id:=(item->>'entityId')::uuid; item_kind:=item->>'kind';item_text:=trim(item->>'text');
  if target_id is null or target_type is null or item_kind is null or item_kind not in ('note','preference','experience','task','change') or item_text is null or length(item_text) not between 1 and 4000 then raise exception 'Invalid memory item'; end if;
  if item_kind='preference' and target_type<>'client' then raise exception 'Preferences must target a client'; end if;
  related:=target_type=p_entity_type and target_id=p_entity_id;
  if not related and p_entity_type='booking' then
   if target_type='client' then select exists(select 1 from public.bookings where id=p_entity_id and client_id=target_id) into related;
   elsif target_type='venue' then select exists(select 1 from public.bookings where id=p_entity_id and venue_id=target_id) into related;
   elsif target_type='partner' then select exists(select 1 from public.booking_partners where booking_id=p_entity_id and partner_id=target_id) into related;
   end if;
  end if;
  if not related then raise exception 'Item must belong to selected entity or a linked entity' using errcode='42501'; end if;
  if not public.can_record_context(target_type,target_id) and not
   (p_entity_type='booking' and target_type='client' and item_kind='preference' and public.is_assigned_to_booking(p_entity_id)) then
   raise exception 'Item target not allowed' using errcode='42501';
  end if;
  assigned:=case when item_kind='task' then nullif(item->>'assigneeId','')::uuid else null end;
  if assigned is not null and (not exists(select 1 from public.artists where id=assigned and employment_status='active') or
   (not public.is_business_admin() and assigned<>public.current_artist_id())) then raise exception 'Assignee not allowed' using errcode='42501'; end if;
  item_status:=case when item_kind='change' or (target_type='client' and not public.is_business_admin()) then 'pending_review' else 'confirmed' end;
  insert into public.context_memory_items(batch_id,entity_type,entity_id,kind,content,due_date,assigned_artist_id,status,position)
  values(p_request_id,target_type,target_id,item_kind,item_text,case when item_kind='task' then nullif(item->>'dueDate','')::date else null end,assigned,item_status,n);
  n:=n+1;
 end loop;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_value)
 values(actor,'context_memory',p_request_id,'confirmed',jsonb_build_object('draft_id',proposal,'item_count',n));
 return jsonb_build_object('id',p_request_id,'item_count',n,'replayed',false);
end $$;
revoke all on function public.save_context_memory(uuid,text,uuid,text,text,jsonb) from public;
grant execute on function public.save_context_memory(uuid,text,uuid,text,text,jsonb) to authenticated;
