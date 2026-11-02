-- Additive V2.4: immutable originals, separately confirmed summaries, private files.
-- No existing business fields or policies are replaced. Rollback: docs/V24_ROLLBACK.md.
create table public.communication_records (
 id uuid primary key, enquiry_id uuid references public.website_enquiries(id),
 booking_id uuid references public.bookings(id), raw_text text not null default '',
 input_kind text not null check(input_kind in ('text','voice','mixed')),
 author_id uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check(num_nonnulls(enquiry_id,booking_id)=1)
);
create table public.communication_attachments (
 id uuid primary key, record_id uuid not null references public.communication_records(id),
 object_path text not null unique, name text not null, mime_type text not null,
 byte_size bigint not null check(byte_size between 1 and 10000000), created_at timestamptz not null default now()
);
create table public.communication_summaries (
 id uuid primary key, enquiry_id uuid references public.website_enquiries(id),
 booking_id uuid references public.bookings(id), source_ids uuid[] not null,
 content jsonb not null, confirmed_by uuid not null references public.profiles(id),
 confirmed_at timestamptz not null default now(), check(num_nonnulls(enquiry_id,booking_id)=1)
);
create table sculpy_private.communication_requests (
 id uuid primary key, actor_id uuid not null, action text not null, payload jsonb not null, result jsonb not null
);
create index communication_records_lead_idx on public.communication_records(enquiry_id,created_at,id);
create index communication_records_booking_idx on public.communication_records(booking_id,created_at,id);
create index communication_attachments_record_idx on public.communication_attachments(record_id);
create index communication_summaries_lead_idx on public.communication_summaries(enquiry_id,confirmed_at);
create index communication_summaries_booking_idx on public.communication_summaries(booking_id,confirmed_at);
create index communication_records_author_idx on public.communication_records(author_id);
create index communication_summaries_author_idx on public.communication_summaries(confirmed_by);
alter table public.communication_records enable row level security;
alter table public.communication_attachments enable row level security;
alter table public.communication_summaries enable row level security;
alter table sculpy_private.communication_requests enable row level security;
revoke all on public.communication_records,public.communication_attachments,public.communication_summaries from public,anon,authenticated;
revoke all on sculpy_private.communication_requests from public,anon,authenticated;
grant select on public.communication_records,public.communication_attachments,public.communication_summaries to authenticated;
create policy communication_records_read on public.communication_records for select to authenticated using(public.is_business_admin());
create policy communication_attachments_read on public.communication_attachments for select to authenticated using(public.is_business_admin());
create policy communication_summaries_read on public.communication_summaries for select to authenticated using(public.is_business_admin());

create function sculpy_private.communication_scope(p_type text,p_id uuid,p_lead uuid,p_booking uuid) returns boolean
language sql stable set search_path='' as $$
 select case when p_type='lead' then p_lead=p_id
 when p_type='booking' then p_booking=p_id or exists(select 1 from public.website_enquiries where id=p_lead and booking_id=p_id)
 else false end
$$;
revoke all on function sculpy_private.communication_scope(text,uuid,uuid,uuid) from public,anon,authenticated;

create function sculpy_private.communication_context(p_type text,p_id uuid,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception '仅有效管理员可查看沟通原文。' using errcode='42501';end if;
 if not ((p_type='lead' and exists(select 1 from public.website_enquiries where id=p_id)) or
 (p_type='booking' and exists(select 1 from public.bookings where id=p_id and deleted_at is null))) then raise exception '记录对象不存在。' using errcode='22023';end if;
 with scoped as (select r.*,p.display_name as author from public.communication_records r join public.profiles p on p.id=r.author_id
 where sculpy_private.communication_scope(p_type,p_id,r.enquiry_id,r.booking_id)),
 page as (select * from scoped where p_before is null or (created_at,id)<(p_before,p_before_id) order by created_at desc,id desc limit 50)
 select jsonb_build_object('total',(select count(*) from scoped),
 'pending',(select count(*) from scoped r where not exists(select 1 from public.communication_summaries s where r.id=any(s.source_ids))),
 'records',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from (
 select page.*,coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.communication_attachments a where a.record_id=page.id),'[]'::jsonb) attachments,
 exists(select 1 from public.communication_summaries s where page.id=any(s.source_ids)) reviewed from page) x),'[]'::jsonb),
 'summaries',coalesce((select jsonb_agg(to_jsonb(x) order by x.confirmed_at desc) from (select s.*,p.display_name as author from public.communication_summaries s join public.profiles p on p.id=s.confirmed_by
 where sculpy_private.communication_scope(p_type,p_id,s.enquiry_id,s.booking_id) order by confirmed_at desc limit 10)x),'[]'::jsonb)) into result;
 return result;
end$$;
revoke all on function sculpy_private.communication_context(text,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function sculpy_private.communication_context(text,uuid,timestamptz,uuid) to authenticated;
create function public.sculpy_communication_context(p_type text,p_id uuid,p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.communication_context(p_type,p_id,p_before,p_before_id)$$;
revoke all on function public.sculpy_communication_context(text,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.sculpy_communication_context(text,uuid,timestamptz,uuid) to authenticated;

create function sculpy_private.communication_command(p_request_id uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior sculpy_private.communication_requests; t text; target uuid; a jsonb; ids uuid[];
 result jsonb; lead public.website_enquiries; obj record;
begin
 if actor is null or not public.is_business_admin() then raise exception '仅有效管理员可保存沟通记录。' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception '请求无效。' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('communication:'||p_request_id::text,0));
 select * into prior from sculpy_private.communication_requests where id=p_request_id;
 if found then
  if prior.actor_id<>actor or prior.action<>p_action or prior.payload<>p_payload then raise exception '请求编号已使用。' using errcode='23505';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if p_action in ('add_record','confirm_summary') then
  t:=p_payload->>'type';target:=(p_payload->>'id')::uuid;
  if not ((t='lead' and exists(select 1 from public.website_enquiries where id=target)) or
  (t='booking' and exists(select 1 from public.bookings where id=target and deleted_at is null))) then raise exception '记录对象不存在。' using errcode='22023';end if;
  if p_action='add_record' then
   if (p_payload-array['type','id','text','kind','attachments'])<>'{}'::jsonb or jsonb_typeof(p_payload->'text') is distinct from 'string'
   or p_payload->>'kind' is null or p_payload->>'kind' not in ('text','voice','mixed') or jsonb_typeof(p_payload->'attachments') is distinct from 'array'
   or jsonb_array_length(p_payload->'attachments')>20 then raise exception '记录格式无效；每次最多20个附件。' using errcode='22023';end if;
   if length(trim(p_payload->>'text'))=0 and jsonb_array_length(p_payload->'attachments')=0 then raise exception '请填写文字或添加附件。' using errcode='22023';end if;
   insert into public.communication_records(id,enquiry_id,booking_id,raw_text,input_kind,author_id)
   values(p_request_id,case when t='lead' then target end,case when t='booking' then target end,p_payload->>'text',p_payload->>'kind',actor);
   for a in select value from jsonb_array_elements(p_payload->'attachments') loop
    if (a-array['id','path','name','mime','size'])<>'{}'::jsonb or length(a->>'name') not between 1 and 300 or (a->>'size')::bigint not between 1 and 10000000
    or a->>'mime' not in ('image/png','image/jpeg','image/webp','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/mpeg')
    or a->>'path' not like actor::text||'/'||p_request_id::text||'/'||(a->>'id')||'.%' then raise exception '附件格式无效。' using errcode='22023';end if;
    if to_regclass('storage.objects') is null then raise exception '私有附件存储未配置。';end if;
    execute 'select metadata from storage.objects where bucket_id=$1 and name=$2' into obj using 'sculpy-communications',a->>'path';
    if obj.metadata is null or (obj.metadata->>'size')::bigint is distinct from (a->>'size')::bigint or obj.metadata->>'mimetype' is distinct from a->>'mime' then raise exception '附件尚未上传完成或元数据不符。';end if;
    insert into public.communication_attachments(id,record_id,object_path,name,mime_type,byte_size)
    values((a->>'id')::uuid,p_request_id,a->>'path',a->>'name',a->>'mime',(a->>'size')::bigint);
   end loop;
   result:=jsonb_build_object('recordId',p_request_id);
  else
   if (p_payload-array['type','id','sourceIds','content','confirmed'])<>'{}'::jsonb or p_payload->'confirmed' is distinct from 'true'::jsonb
   or jsonb_typeof(p_payload->'sourceIds') is distinct from 'array' or jsonb_array_length(p_payload->'sourceIds') not between 1 and 50
   or jsonb_typeof(p_payload->'content') is distinct from 'object' or ((p_payload->'content')-array['needs','confirmed','pending','changes','followUp'])<>'{}'::jsonb
   or not (p_payload->'content' ?& array['needs','confirmed','pending','changes','followUp']) or length((p_payload->'content')::text)>50000 then raise exception '请核对摘要并明确确认。' using errcode='22023';end if;
   for a in select value from jsonb_each(p_payload->'content') loop
    if jsonb_typeof(a)<>'array' or exists(select 1 from jsonb_array_elements(a) x where jsonb_typeof(x)<>'string') then raise exception '摘要字段须为文字列表。' using errcode='22023';end if;
   end loop;
   select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload->'sourceIds');
   if (select count(distinct x) from unnest(ids)x)<>cardinality(ids) or
   (select count(*) from public.communication_records r where r.id=any(ids) and sculpy_private.communication_scope(t,target,r.enquiry_id,r.booking_id))<>cardinality(ids) then raise exception '摘要来源不属于当前对象。' using errcode='42501';end if;
   insert into public.communication_summaries(id,enquiry_id,booking_id,source_ids,content,confirmed_by)
   values(p_request_id,case when t='lead' then target end,case when t='booking' then target end,ids,p_payload->'content',actor);
   result:=jsonb_build_object('summaryId',p_request_id);
  end if;
 elsif p_action='convert_lead' then
  if (p_payload-array['leadId','revision','draft','rawText','recordedAt','confirmed'])<>'{}'::jsonb or p_payload->'confirmed' is distinct from 'true'::jsonb then raise exception '请先核对客户及订单。' using errcode='22023';end if;
  select * into lead from public.website_enquiries where id=(p_payload->>'leadId')::uuid for update;
  if not found or lead.revision is distinct from (p_payload->>'revision')::integer then raise exception '询盘已变化，请刷新。' using errcode='40001';end if;
  if lead.booking_id is not null or lead.status in ('lost','spam') then raise exception '询盘已关联订单或已关闭，请先核对。' using errcode='22023';end if;
  result:=sculpy_private.confirm_intake(p_request_id,p_payload->'draft',p_payload->>'rawText',(p_payload->>'recordedAt')::timestamptz);
  update public.bookings set originating_enquiry_id=lead.id,source=lead.attribution_source where id=(result->>'bookingId')::uuid;
  update public.website_enquiries set booking_id=(result->>'bookingId')::uuid,revision=revision+1,updated_at=now() where id=lead.id;
  result:=result||jsonb_build_object('leadId',lead.id);
 else raise exception '不支持的沟通操作。' using errcode='22023';end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_value) values(actor,'communication',p_request_id,p_action,result);
 insert into sculpy_private.communication_requests values(p_request_id,actor,p_action,p_payload,result);
 return result||jsonb_build_object('replayed',false);
end$$;
revoke all on function sculpy_private.communication_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function sculpy_private.communication_command(uuid,text,jsonb) to authenticated;
create function public.sculpy_communication_command(p_request_id uuid,p_action text,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.communication_command(p_request_id,p_action,p_payload)$$;
revoke all on function public.sculpy_communication_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.sculpy_communication_command(uuid,text,jsonb) to authenticated;

-- Local relational tests have no Storage service; the dedicated storage test supplies its schema.
create function sculpy_private.communication_sources(p_type text,p_id uuid,p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception '仅有效管理员可整理沟通原文。' using errcode='42501';end if;
 if cardinality(p_ids) not between 1 and 50 or cardinality(p_ids) is null or
 (select count(distinct x) from unnest(p_ids)x)<>cardinality(p_ids) or
 (select count(*) from public.communication_records r where r.id=any(p_ids) and sculpy_private.communication_scope(p_type,p_id,r.enquiry_id,r.booking_id))<>cardinality(p_ids)
 then raise exception '请选取当前对象的1–50条记录。' using errcode='42501';end if;
 select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) into result from (
 select r.*,p.display_name as author,coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.communication_attachments a where a.record_id=r.id),'[]'::jsonb) attachments
 from public.communication_records r join public.profiles p on p.id=r.author_id where r.id=any(p_ids))x;
 return result;
end$$;
revoke all on function sculpy_private.communication_sources(text,uuid,uuid[]) from public,anon,authenticated;
grant execute on function sculpy_private.communication_sources(text,uuid,uuid[]) to authenticated;
create function public.sculpy_communication_sources(p_type text,p_id uuid,p_ids uuid[]) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.communication_sources(p_type,p_id,p_ids)$$;
revoke all on function public.sculpy_communication_sources(text,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.sculpy_communication_sources(text,uuid,uuid[]) to authenticated;

create function sculpy_private.communication_inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception '仅有效管理员可读取待整理列表。' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select case when coalesce(r.booking_id,e.booking_id) is not null then 'booking' else 'lead' end as type,
 coalesce(r.booking_id,e.booking_id,r.enquiry_id) as id,coalesce(c.display_name,e.name,'客户') as label,
 count(*) as pending,max(r.created_at) as latest_at
 from public.communication_records r left join public.website_enquiries e on e.id=r.enquiry_id
 left join public.bookings b on b.id=coalesce(r.booking_id,e.booking_id)
 left join public.clients c on c.id=b.client_id
 left join public.website_enquiries origin on origin.id=b.originating_enquiry_id
 where not coalesce(e.is_test,false) and not coalesce(origin.is_test,false) and b.deleted_at is null
 and not exists(select 1 from public.communication_summaries s where r.id=any(s.source_ids))
 group by 1,2,3 order by max(r.created_at) desc limit 100)x),'[]'::jsonb);
end$$;
revoke all on function sculpy_private.communication_inbox() from public,anon,authenticated;
grant execute on function sculpy_private.communication_inbox() to authenticated;
create function public.sculpy_communication_inbox() returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.communication_inbox()$$;
revoke all on function public.sculpy_communication_inbox() from public,anon,authenticated;
grant execute on function public.sculpy_communication_inbox() to authenticated;

do $storage$ begin
 if to_regclass('storage.buckets') is not null then
  execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('sculpy-communications','sculpy-communications',false,10000000,array['image/png','image/jpeg','image/webp','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/mpeg'])$sql$;
  execute $sql$create policy communication_upload on storage.objects for insert to authenticated with check
  (bucket_id='sculpy-communications' and public.is_business_admin() and split_part(name,'/',1)=(select auth.uid())::text and cardinality(string_to_array(name,'/'))=3)$sql$;
  execute $sql$create policy communication_download on storage.objects for select to authenticated using
  (bucket_id='sculpy-communications' and public.is_business_admin() and (split_part(name,'/',1)=(select auth.uid())::text or exists(select 1 from public.communication_attachments a where a.object_path=storage.objects.name)))$sql$;
  execute $sql$create policy communication_orphan_delete on storage.objects for delete to authenticated using
  (bucket_id='sculpy-communications' and public.is_business_admin() and split_part(name,'/',1)=(select auth.uid())::text and not exists(select 1 from public.communication_attachments a where a.object_path=storage.objects.name))$sql$;
 end if;
end $storage$;
