-- V3.2 is an isolated additive increment. No business seed data or old migrations.
begin;
create table sculpy_private.os32_commands(
 id uuid primary key, actor_id uuid not null references public.profiles(id),kind text not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table sculpy_private.os32_commands enable row level security;
revoke all on sculpy_private.os32_commands from public,anon,authenticated;

create function sculpy_private.os32_actor() returns uuid language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception 'Business administrator required' using errcode='42501';end if;
 return auth.uid();
end $$;
create function sculpy_private.os32_replay(p_id uuid,p_kind text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare old sculpy_private.os32_commands;actor uuid:=sculpy_private.os32_actor();
begin
 if p_id is null then raise exception 'Request ID required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,32));
 select * into old from sculpy_private.os32_commands where id=p_id;
 if found then
  if old.actor_id is distinct from actor or old.kind is distinct from p_kind or old.payload is distinct from p_payload then raise exception 'Request ID conflict' using errcode='23505';end if;
  return old.result||jsonb_build_object('replayed',true);
 end if;
 return null;
end $$;
create function sculpy_private.os32_fields(p_fields jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare k text;v text;result jsonb:='{}';limits jsonb:='{"display_name":160,"preferred_name":160,"phone":100,"email":254,"wechat":160,"instagram":160,"referral_source":100,"city":100,"preferred_language":40,"wedding_date":10,"internal_notes":8000}';d date;
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or (p_fields-array['display_name','preferred_name','phone','email','wechat','instagram','referral_source','city','preferred_language','wedding_date','tags','internal_notes'])<>'{}' then
  raise exception 'Unknown client fields' using errcode='22023';end if;
 for k in select jsonb_object_keys(limits) loop
  if p_fields?k and jsonb_typeof(p_fields->k) not in ('string','null') then raise exception 'Invalid text field %',k using errcode='22023';end if;
  v:=nullif(trim(p_fields->>k),'');
  if length(v)>(limits->>k)::int then raise exception 'Field too long: %',k using errcode='22023';end if;
  result:=result||jsonb_build_object(k,v);
 end loop;
 if result->>'display_name' is null then raise exception 'Client name required' using errcode='22023';end if;
 if result->>'email' is not null and result->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+$' then raise exception 'Invalid email' using errcode='22023';end if;
 if result->>'wedding_date' is not null then
  if result->>'wedding_date'!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Complete wedding date required' using errcode='22023';end if;
  begin d:=(result->>'wedding_date')::date;exception when others then raise exception 'Invalid wedding date' using errcode='22023';end;
  if not isfinite(d) then raise exception 'Invalid wedding date' using errcode='22023';end if;
 end if;
 if p_fields?'tags' and (jsonb_typeof(p_fields->'tags')<>'array' or jsonb_array_length(p_fields->'tags')>20) then raise exception 'Invalid tags' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_fields->'tags','[]')) t where jsonb_typeof(t)<>'string' or length(trim(t#>>'{}')) not between 1 and 50) then raise exception 'Invalid tag' using errcode='22023';end if;
 return result||jsonb_build_object('tags',coalesce(p_fields->'tags','[]'));
end $$;
create function sculpy_private.os32_revision(p_client_id uuid) returns text language sql stable security invoker set search_path='' as $$
 select md5(to_jsonb(c)::text||coalesce(to_jsonb(p)::text,'')) from public.clients c left join public.client_private p on p.client_id=c.id where c.id=p_client_id and c.deleted_at is null
$$;
create function sculpy_private.os32_client_detail(p_client_id uuid,p_offset integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform sculpy_private.os32_actor();
 result:=sculpy_private.os_client_detail(p_client_id,p_offset);
 return result||jsonb_build_object('revision',sculpy_private.os32_revision(p_client_id),'client',(result->'client')||jsonb_build_object('tags',(select to_jsonb(tags) from public.clients where id=p_client_id)));
end $$;
create function public.sculpy_os_client_detail_v32(p_client_id uuid,p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_client_detail(p_client_id,p_offset)$$;

create function sculpy_private.os32_client_review(p_client_id uuid,p_expected_revision text,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare fields jsonb:=sculpy_private.os32_fields(p_fields);revision text;warnings jsonb;
begin
 perform sculpy_private.os32_actor();revision:=sculpy_private.os32_revision(p_client_id);
 if revision is null then raise exception 'Client unavailable' using errcode='22023';end if;
 if revision is distinct from p_expected_revision then raise exception 'Client changed; reread' using errcode='40001';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.display_name)),'[]') into warnings from public.clients c left join public.client_private p on p.client_id=c.id
 where c.id<>p_client_id and c.deleted_at is null and (lower(c.display_name)=lower(fields->>'display_name')
  or fields->>'email' is not null and lower(p.email)=lower(fields->>'email') or fields->>'phone' is not null and p.phone=fields->>'phone');
 return jsonb_build_object('revision',revision,'fields',fields,'possibleDuplicates',warnings);
end $$;
create function public.sculpy_os_client_review(p_client_id uuid,p_expected_revision text,p_fields jsonb) returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_client_review(p_client_id,p_expected_revision,p_fields)$$;

create function sculpy_private.os32_update_client(p_request_id uuid,p_client_id uuid,p_expected_revision text,p_fields jsonb,p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=sculpy_private.os32_actor();payload jsonb;result jsonb;f jsonb;before_record jsonb;
begin
 if p_confirmed is distinct from true then raise exception 'Confirmation required' using errcode='22023';end if;
 payload:=jsonb_build_object('client',p_client_id,'revision',p_expected_revision,'fields',p_fields);
 result:=sculpy_private.os32_replay(p_request_id,'client_edit',payload);if result is not null then return result;end if;
 perform 1 from public.clients where id=p_client_id and deleted_at is null for update;
 perform 1 from public.client_private where client_id=p_client_id for update;
 f:=sculpy_private.os32_client_review(p_client_id,p_expected_revision,p_fields)->'fields';
 before_record:=sculpy_private.os32_client_detail(p_client_id,0)-'bookings';
 update public.clients set display_name=f->>'display_name',preferred_name=f->>'preferred_name',referral_source=f->>'referral_source',city=f->>'city',preferred_language=f->>'preferred_language',wedding_date=(f->>'wedding_date')::date,tags=array(select jsonb_array_elements_text(f->'tags')) where id=p_client_id;
 insert into public.client_private(client_id,phone,email,wechat,instagram,internal_notes) values(p_client_id,f->>'phone',f->>'email',f->>'wechat',f->>'instagram',f->>'internal_notes')
 on conflict(client_id) do update set phone=excluded.phone,email=excluded.email,wechat=excluded.wechat,instagram=excluded.instagram,internal_notes=excluded.internal_notes;
 result:=jsonb_build_object('id',p_client_id,'requestId',p_request_id,'revision',sculpy_private.os32_revision(p_client_id),'replayed',false);
 insert into sculpy_private.os32_commands values(p_request_id,actor,'client_edit',payload,result,now());
 insert into public.audit_events(actor_id,entity_type,entity_id,action,before_value,after_value) values(actor,'client',p_client_id,'os_edit',before_record,f);
 return result;
end $$;
create function public.sculpy_os_update_client(p_request_id uuid,p_client_id uuid,p_expected_revision text,p_fields jsonb,p_confirmed boolean default false) returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_update_client(p_request_id,p_client_id,p_expected_revision,p_fields,p_confirmed)$$;

create function sculpy_private.os32_task_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform sculpy_private.os32_actor();
 return jsonb_build_object('actor',auth.uid(),'assignees',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name,id) from public.profiles where active and role in ('owner','operations')),'[]'));
end $$;
create function public.sculpy_os_task_context() returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_task_context()$$;
create function sculpy_private.os32_tasks(p_status text,p_offset integer,p_scope text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform sculpy_private.os32_actor();
 if p_status is null or p_status not in ('open','done','dismissed') or p_scope is null or p_scope not in ('team','mine') or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid task filter' using errcode='22023';end if;
 return jsonb_build_object('total',(select count(*) from public.reminders where status=p_status and (p_scope='team' or assigned_to=auth.uid())),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by due_at,id) from (select r.id,r.reason,r.due_at,r.status,r.edit_version::text,r.assigned_to,r.client_id,r.booking_id,p.display_name as assignee,c.display_name as client,b.order_number
 from public.reminders r left join public.profiles p on p.id=r.assigned_to left join public.clients c on c.id=r.client_id and c.deleted_at is null left join public.bookings b on b.id=r.booking_id and b.deleted_at is null
 where r.status=p_status and (p_scope='team' or r.assigned_to=auth.uid()) order by r.due_at,r.id limit 20 offset p_offset)t),'[]'));
end $$;
create function public.sculpy_os_tasks_v32(p_status text default 'open',p_offset integer default 0,p_scope text default 'team') returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_tasks(p_status,p_offset,p_scope)$$;
create function sculpy_private.os32_create_task(p_id uuid,p_title text,p_due_at timestamptz,p_assigned_to uuid,p_booking_id uuid,p_client_id uuid,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=sculpy_private.os32_actor();payload jsonb;result jsonb;
begin
 if p_confirmed is distinct from true then raise exception 'Confirmation required' using errcode='22023';end if;
 payload:=jsonb_build_object('title',p_title,'due',p_due_at,'assignee',p_assigned_to,'booking',p_booking_id,'client',p_client_id);
 result:=sculpy_private.os32_replay(p_id,'task_create',payload);if result is not null then return result;end if;
 perform 1 from public.profiles where id=p_assigned_to and active and role in ('owner','operations') for share;
 if not found then raise exception 'Assignee unavailable' using errcode='22023';end if;
 if exists(select 1 from public.reminders where id=p_id) then raise exception 'Task ID conflict' using errcode='23505';end if;
 perform sculpy_private.os_create_task(p_id,p_title,p_due_at,p_booking_id,p_client_id,p_confirmed);
 if p_assigned_to<>actor then
  update public.reminders set assigned_to=p_assigned_to where id=p_id;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,before_value,after_value) values(actor,'reminder',p_id,'os_assign',jsonb_build_object('assigned_to',actor),jsonb_build_object('assigned_to',p_assigned_to));
 end if;
 result:=jsonb_build_object('id',p_id,'requestId',p_id,'replayed',false);
 insert into sculpy_private.os32_commands values(p_id,actor,'task_create',payload,result,now());return result;
end $$;
create function public.sculpy_os_create_task_v32(p_id uuid,p_title text,p_due_at timestamptz,p_assigned_to uuid,p_booking_id uuid default null,p_client_id uuid default null,p_confirmed boolean default false) returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_create_task(p_id,p_title,p_due_at,p_assigned_to,p_booking_id,p_client_id,p_confirmed)$$;
create function sculpy_private.os32_reassign_task(p_request_id uuid,p_task_id uuid,p_expected_version bigint,p_assigned_to uuid,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=sculpy_private.os32_actor();old public.reminders;payload jsonb;result jsonb;
begin
 if p_confirmed is distinct from true then raise exception 'Confirmation required' using errcode='22023';end if;
 payload:=jsonb_build_object('task',p_task_id,'version',p_expected_version,'assignee',p_assigned_to);
 result:=sculpy_private.os32_replay(p_request_id,'task_reassign',payload);if result is not null then return result;end if;
 select * into old from public.reminders where id=p_task_id for update;
 if not found then raise exception 'Task unavailable' using errcode='22023';end if;
 if p_expected_version is null or p_expected_version<>old.edit_version then raise exception 'Task changed' using errcode='40001';end if;
 perform 1 from public.profiles where id=p_assigned_to and active and role in ('owner','operations') for share;
 if not found then raise exception 'Assignee unavailable' using errcode='22023';end if;
 update public.reminders set assigned_to=p_assigned_to where id=p_task_id;
 result:=jsonb_build_object('id',p_task_id,'requestId',p_request_id,'replayed',false);
 insert into sculpy_private.os32_commands values(p_request_id,actor,'task_reassign',payload,result,now());
 insert into public.audit_events(actor_id,entity_type,entity_id,action,before_value,after_value) values(actor,'reminder',p_task_id,'os_reassign',jsonb_build_object('assigned_to',old.assigned_to),jsonb_build_object('assigned_to',p_assigned_to));return result;
end $$;
create function public.sculpy_os_reassign_task(p_request_id uuid,p_task_id uuid,p_expected_version bigint,p_assigned_to uuid,p_confirmed boolean default false) returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_reassign_task(p_request_id,p_task_id,p_expected_version,p_assigned_to,p_confirmed)$$;

create table sculpy_private.os32_import_rows(
 kind text not null,source_key text not null,content_hash text not null,entity_id uuid not null,
 batch_id uuid not null references sculpy_private.os32_commands(id) deferrable initially deferred,
 source_line integer not null,created_at timestamptz not null default now(),primary key(kind,source_key)
);
alter table sculpy_private.os32_import_rows enable row level security;
revoke all on sculpy_private.os32_import_rows from public,anon,authenticated;
create function sculpy_private.os32_import_time(p_day text,p_time text,p_offset text,p_iso text default null) returns timestamptz
language plpgsql security invoker set search_path='' as $$
declare local_time timestamp;instant timestamptz;
begin
 if nullif(p_iso,'') is not null then
  if p_iso!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$' then raise exception '开始时间须包含完整年份和时区偏移';end if;
  instant:=p_iso::timestamptz;
 else
  if coalesce(p_day,'')!~'^\d{4}-\d{2}-\d{2}$' then raise exception '服务日期需要完整年月日';end if;
  if coalesce(p_time,'')!~'^\d{2}:\d{2}$' then raise exception '缺少具体开始时间，请补齐；不会使用默认时间';end if;
  local_time:=(p_day||' '||p_time)::timestamp;
  if nullif(p_offset,'') is not null then
   if p_offset!~'^[+-]\d{2}:\d{2}$' then raise exception '时区偏移格式为 -04:00 或 -05:00';end if;
   instant:=(p_day||'T'||p_time||p_offset)::timestamptz;
  else
   instant:=local_time at time zone 'America/Toronto';
   if ((instant-interval '1 hour') at time zone 'America/Toronto')=local_time or ((instant+interval '1 hour') at time zone 'America/Toronto')=local_time then raise exception '夏令时重复时段，请填写 utc_offset';end if;
  end if;
  if (instant at time zone 'America/Toronto')<>local_time then raise exception '时间不存在或偏移与多伦多时区不一致';end if;
 end if;
 if not isfinite(instant) or extract(year from instant)<1900 or extract(year from instant)>2100 then raise exception '日期超出有效范围';end if;
 return instant;
exception when invalid_datetime_format or datetime_field_overflow then raise exception '日期或时间无效';
end $$;
create function sculpy_private.os32_import_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform sculpy_private.os32_actor();return jsonb_build_object('services',coalesce((select jsonb_agg(jsonb_build_object('code',code,'name',name,'active',active) order by name) from public.services),'[]'));end $$;
create function public.sculpy_os_import_catalog() returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_import_catalog()$$;

create function sculpy_private.os32_import_row(p_kind text,p_row jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<row_context>>
declare f jsonb;candidates jsonb;choice text:=nullif(p_row->>'client_choice','');cid uuid;sid uuid;start_time timestamptz;end_time timestamptz;
 normalized jsonb;source_key text;content_hash text;old sculpy_private.os32_import_rows;price numeric;budget numeric;existing_order uuid;line_number integer;email text;phone text;client_name text;
begin
 if jsonb_typeof(p_row)<>'object' or length(coalesce(p_row->>'external_id',''))>160 then raise exception '无效的行内容或来源编号';end if;
 line_number:=(p_row->>'line')::integer;if line_number<2 or line_number>1000000 then raise exception '原文件行号无效';end if;
 if p_kind='clients' then
  if (p_row-array['line','external_id','client_choice','display_name','preferred_name','phone','email','wechat','instagram','referral_source','city','preferred_language','wedding_date','tags','internal_notes'])<>'{}' then raise exception '客户文件包含不支持的字段';end if;
  f:=sculpy_private.os32_fields((p_row-array['line','external_id','client_choice','tags'])||jsonb_build_object('tags',case when nullif(trim(p_row->>'tags'),'') is null then '[]'::jsonb else to_jsonb(string_to_array(p_row->>'tags',';')) end));
  client_name:=f->>'display_name';email:=f->>'email';phone:=f->>'phone';
  content_hash:=md5(jsonb_build_object('fields',f)::text);
  source_key:=case when nullif(trim(p_row->>'external_id'),'') is not null then 'external:'||trim(p_row->>'external_id') else 'content:'||content_hash end;
  select * into old from sculpy_private.os32_import_rows x where x.kind=p_kind and x.source_key=row_context.source_key;
  if found then
   if old.content_hash<>content_hash then raise exception '该来源编号已导入过不同内容，请核对原记录';end if;
   if choice is not null and choice not in ('new','new_confirmed') and choice::uuid<>old.entity_id then raise exception '来源编号关联的原客户与当前选择不一致，请核对原记录';end if;
   if not exists(select 1 from public.clients where id=old.entity_id and deleted_at is null) then raise exception '原导入记录已不可用，请人工核对';end if;
   return jsonb_build_object('line',line_number,'action','skip','reason','此记录已导入','id',old.entity_id,'sourceKey',source_key,'hash',content_hash,'normalized',jsonb_build_object('fields',f));
  end if;
 elsif p_kind='orders' then
  if (p_row-array['line','external_id','client_choice','client_name','client_email','client_phone','service','service_date','start_time','utc_offset','starts_at','ends_at','status','currency','price','budget','details','order_number'])<>'{}' then raise exception '订单文件包含不支持的字段';end if;
  client_name:=nullif(trim(p_row->>'client_name'),'');email:=nullif(trim(p_row->>'client_email'),'');phone:=nullif(trim(p_row->>'client_phone'),'');
 else raise exception '导入类型无效';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.display_name,'email',p.email,'phone',p.phone) order by c.display_name,c.id),'[]') into candidates
 from public.clients c left join public.client_private p on p.client_id=c.id where c.deleted_at is null and
 (client_name is not null and lower(c.display_name)=lower(client_name) or row_context.email is not null and lower(p.email)=lower(row_context.email) or row_context.phone is not null and p.phone=row_context.phone);
 if choice is not null and choice not in ('new','new_confirmed') then
  begin cid:=choice::uuid;exception when others then raise exception '请重新选择客户';end;
  if not exists(select 1 from public.clients where id=cid and deleted_at is null) then raise exception '选择的客户不可用';end if;
 elsif p_kind='orders' then
  return jsonb_build_object('line',line_number,'action','choose','reason',case when jsonb_array_length(candidates)=0 then '请先录入或导入客户，再关联订单' else '请人工选择要关联的客户' end,'candidates',candidates);
 elsif jsonb_array_length(candidates)>0 and choice is distinct from 'new_confirmed' then
  return jsonb_build_object('line',line_number,'action','choose','reason','可能已有同名或同联系方式客户，请选择已有客户或确认另建','candidates',candidates);
 end if;
 if p_kind='clients' then
  normalized:=jsonb_build_object('fields',f,'client',cid,'revision',sculpy_private.os32_revision(cid));
 else
  select id into sid from public.services where lower(code)=lower(trim(p_row->>'service')) or lower(name)=lower(trim(p_row->>'service'));
  if sid is null or (select count(*) from public.services where lower(code)=lower(trim(p_row->>'service')) or lower(name)=lower(trim(p_row->>'service')))<>1 then raise exception '服务类型不明确，请使用系统中的服务代码';end if;
  start_time:=sculpy_private.os32_import_time(p_row->>'service_date',p_row->>'start_time',p_row->>'utc_offset',p_row->>'starts_at');
  if nullif(trim(p_row->>'ends_at'),'') is not null then
   end_time:=sculpy_private.os32_import_time(null,null,null,p_row->>'ends_at');if end_time<=start_time then raise exception '结束时间必须晚于开始时间';end if;
  end if;
  if coalesce(p_row->>'status','') not in ('inquiry','confirmed','completed','cancelled') then raise exception '请填写核对后的订单状态 inquiry/confirmed/completed/cancelled';end if;
  if coalesce(p_row->>'currency','')!~'^[A-Z]{3}$' then raise exception '请填写已核对的三位币种，如 CAD';end if;
  if nullif(trim(p_row->>'price'),'') is not null then
   if p_row->>'price'!~'^\d{1,8}(\.\d{1,2})?$' then raise exception '成交价需要非负金额，最多两位小数；未知请留空';end if;price:=(p_row->>'price')::numeric;
  end if;
  if nullif(trim(p_row->>'budget'),'') is not null then
   if p_row->>'budget'!~'^\d{1,8}(\.\d{1,2})?$' then raise exception '预算格式无效';end if;budget:=(p_row->>'budget')::numeric;
  end if;
  if length(coalesce(p_row->>'details',''))>4000 then raise exception '服务需求过长';end if;
  normalized:=jsonb_build_object('client',cid,'clientRevision',sculpy_private.os32_revision(cid),'service',sid,'starts_at',start_time,'ends_at',end_time,'status',p_row->>'status','currency',p_row->>'currency','price',price,'budget',budget,'details',nullif(trim(p_row->>'details'),''));
 end if;
 -- A revision is a preview guard, not the stable content identity of an import.
 content_hash:=case when p_kind='clients' then md5(jsonb_build_object('fields',f)::text) else md5((normalized-array['revision','clientRevision'])::text) end;
 source_key:=case when nullif(trim(p_row->>'external_id'),'') is not null then 'external:'||trim(p_row->>'external_id') else 'content:'||content_hash end;
 select * into old from sculpy_private.os32_import_rows where kind=p_kind and os32_import_rows.source_key=row_context.source_key;
 if found then
  if old.content_hash<>content_hash then raise exception '该来源编号已导入过不同内容，请核对原记录';end if;
  if p_kind='clients' and not exists(select 1 from public.clients where id=old.entity_id and deleted_at is null) or p_kind='orders' and not exists(select 1 from public.bookings where id=old.entity_id and deleted_at is null) then raise exception '原导入记录已不可用，请人工核对';end if;
  return jsonb_build_object('line',line_number,'action','skip','reason','此记录已导入','id',old.entity_id,'sourceKey',source_key,'hash',content_hash,'normalized',normalized);
 end if;
 if p_kind='orders' then
  if nullif(trim(p_row->>'order_number'),'') is not null then
   select id into existing_order from public.bookings where order_number=trim(p_row->>'order_number') and client_id=cid and deleted_at is null;
   if existing_order is null then raise exception '原单号未找到或客户不匹配；新单留空，外部编号填 external_id';end if;
  else
   select id into existing_order from public.bookings where client_id=cid and service_id=sid and starts_at=start_time and deleted_at is null order by id limit 1;
  end if;
 end if;
 return jsonb_build_object('line',line_number,'action',case when existing_order is not null then 'link' when p_kind='clients' and cid is not null then 'link' else 'create' end,
  'reason',case when existing_order is not null or p_kind='clients' and cid is not null then '关联已有记录，保留原资料；需要修改请到原记录编辑' else '将新增' end,
  'id',coalesce(existing_order,cid),'clientName',(select display_name from public.clients where id=cid),'sourceKey',source_key,'hash',content_hash,'normalized',normalized,'candidates',candidates);
exception when others then return jsonb_build_object('line',coalesce(line_number,0),'action','error','reason',sqlerrm,'candidates',coalesce(candidates,'[]'));
end $$;

create function sculpy_private.os32_import_preview(p_kind text,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare row_data jsonb;review jsonb;reviews jsonb:='[]';seen jsonb:='{}';seen_hashes jsonb:='{}';seen_targets jsonb:='{}';target text;creates int:=0;links int:=0;skips int:=0;errors int:=0;plan_hash text;
begin
 perform sculpy_private.os32_actor();
 if p_kind is null or p_kind not in ('clients','orders') or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100 or octet_length(p_rows::text)>1048576 then raise exception '每批须为 1 至 100 行，内容不超过 1 MiB' using errcode='22023';end if;
 for row_data in select value from jsonb_array_elements(p_rows) loop
  review:=sculpy_private.os32_import_row(p_kind,row_data);
  if p_kind='clients' and review->>'hash' is not null then
   target:=coalesce(review->'normalized'->>'client',case when review->>'action'='skip' then review->>'id' end,'new');
   if seen_targets?(review->>'hash') and seen_targets->>(review->>'hash')<>target then
    review:=review||jsonb_build_object('action','error','reason','本批相同客户资料选择了不同关联方式，请核对并排除重复行');
   else seen_targets:=seen_targets||jsonb_build_object(review->>'hash',target);end if;
  end if;
  if review->>'sourceKey' is not null and review->>'action'<>'error' then
   if seen?(review->>'sourceKey') then
    if seen->>(review->>'sourceKey')<>review->>'hash' then review:=review||jsonb_build_object('action','error','reason','同一来源编号在本批包含不同内容');
    else review:=review||jsonb_build_object('action','skip','reason','本批重复行');end if;
   else
    seen:=seen||jsonb_build_object(review->>'sourceKey',review->>'hash');
    if seen_hashes?(review->>'hash') and review->>'action'<>'skip' then review:=review||jsonb_build_object('action','skip','reason','本批重复内容','duplicateOf',seen_hashes->>(review->>'hash'));
    else seen_hashes:=seen_hashes||jsonb_build_object(review->>'hash',review->>'sourceKey');end if;
   end if;
  end if;
  case review->>'action' when 'create' then creates:=creates+1;when 'link' then links:=links+1;when 'skip' then skips:=skips+1;else errors:=errors+1;end case;
  reviews:=reviews||jsonb_build_array(review);
 end loop;
 plan_hash:=md5(jsonb_build_object('kind',p_kind,'input',p_rows,'review',reviews)::text);
 return jsonb_build_object('rows',reviews,'creates',creates,'links',links,'skips',skips,'errors',errors,'planHash',plan_hash,'ready',errors=0);
end $$;
create function public.sculpy_os_import_preview(p_kind text,p_rows jsonb) returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_import_preview(p_kind,p_rows)$$;

create function sculpy_private.os32_import_commit(p_request_id uuid,p_kind text,p_rows jsonb,p_plan_hash text,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=sculpy_private.os32_actor();payload jsonb;result jsonb;plan jsonb;r jsonb;n jsonb;entity uuid;ids jsonb:='[]';fields jsonb;cid uuid;client_name text;
begin
 if p_confirmed is distinct from true then raise exception 'Confirmation required' using errcode='22023';end if;
 payload:=jsonb_build_object('kind',p_kind,'rows',p_rows,'plan',p_plan_hash);
 result:=sculpy_private.os32_replay(p_request_id,'import',payload);if result is not null then return result;end if;
 -- Serialize imports, then lock selected clients and contacts in a stable order.
 perform pg_advisory_xact_lock(hashtextextended('sculp-os-history-import',32));
 if jsonb_typeof(p_rows)='array' then
  if p_kind='clients' then
   for client_name in select distinct lower(trim(value->>'display_name')) from jsonb_array_elements(p_rows) order by 1 loop
    if client_name is not null then perform pg_advisory_xact_lock(hashtextextended(client_name,1));end if;
   end loop;
  end if;
  for cid in select distinct (value->>'client_choice')::uuid from jsonb_array_elements(p_rows) where value->>'client_choice'~'^[0-9a-fA-F-]{36}$' order by 1 loop
   perform 1 from public.clients where id=cid for update;perform 1 from public.client_private where client_id=cid for update;
  end loop;
 end if;
 plan:=sculpy_private.os32_import_preview(p_kind,p_rows);
 if plan->>'planHash' is distinct from p_plan_hash then raise exception '导入预览已变化，请重新核对' using errcode='40001';end if;
 if (plan->>'ready')::boolean is not true then raise exception '仍有错误或待核对项' using errcode='22023';end if;
 for r in select value from jsonb_array_elements(plan->'rows') loop
  entity:=nullif(r->>'id','')::uuid;n:=r->'normalized';
  if r->>'action'='create' then
   entity:=gen_random_uuid();
   if p_kind='clients' then
    fields:=n->'fields';perform pg_advisory_xact_lock(hashtextextended(lower(fields->>'display_name'),1));
    -- Explicitly confirmed duplicates may represent different people. Never merge.
    insert into public.clients(id,display_name,preferred_name,referral_source,city,preferred_language,wedding_date,tags,lifecycle_status,created_by)
     values(entity,fields->>'display_name',fields->>'preferred_name',fields->>'referral_source',fields->>'city',fields->>'preferred_language',(fields->>'wedding_date')::date,array(select jsonb_array_elements_text(fields->'tags')),'lead',actor);
    insert into public.client_private(client_id,phone,email,wechat,instagram,internal_notes) values(entity,fields->>'phone',fields->>'email',fields->>'wechat',fields->>'instagram',fields->>'internal_notes');
   else
    insert into public.bookings(id,client_id,service_id,starts_at,ends_at,status,currency,price_cad,budget_cad,service_details,source,created_by)
     values(entity,(n->>'client')::uuid,(n->>'service')::uuid,(n->>'starts_at')::timestamptz,(n->>'ends_at')::timestamptz,(n->>'status')::public.booking_status,n->>'currency',(n->>'price')::numeric,(n->>'budget')::numeric,n->>'details','history_import',actor);
   end if;
  elsif entity is null then
   select entity_id into entity from sculpy_private.os32_import_rows where kind=p_kind and source_key=coalesce(r->>'duplicateOf',r->>'sourceKey');
  end if;
  if r->>'action'<>'skip' or r->>'duplicateOf' is not null and r->>'duplicateOf'<>r->>'sourceKey' then
   insert into sculpy_private.os32_import_rows(kind,source_key,content_hash,entity_id,batch_id,source_line) values(p_kind,r->>'sourceKey',r->>'hash',entity,p_request_id,(r->>'line')::int);
  end if;
  ids:=ids||jsonb_build_array(jsonb_build_object('line',r->'line','action',r->>'action','id',entity,'reason',r->>'reason'));
 end loop;
 result:=jsonb_build_object('id',p_request_id,'requestId',p_request_id,'creates',plan->'creates','links',plan->'links','skips',plan->'skips','rows',ids,'replayed',false);
 insert into sculpy_private.os32_commands values(p_request_id,actor,'import',payload,result,now());
 insert into public.audit_events(actor_id,entity_type,entity_id,action,after_value) values(actor,'import_batch',p_request_id,'os_import',result);
 return result;
end $$;
create function public.sculpy_os_import_commit(p_request_id uuid,p_kind text,p_rows jsonb,p_plan_hash text,p_confirmed boolean default false) returns jsonb language sql security invoker set search_path='' as $$select sculpy_private.os32_import_commit(p_request_id,p_kind,p_rows,p_plan_hash,p_confirmed)$$;

-- Only guarded entry points are callable by authenticated users. All wrappers
-- are SECURITY INVOKER; helper routines and private ledgers are not public APIs.
do $$declare f record;name text;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sculpy_private' and p.proname like 'os32_%' loop execute 'revoke all on function '||f.sig||' from public,anon,authenticated';end loop;
 foreach name in array array['os32_client_detail','os32_client_review','os32_update_client','os32_task_context','os32_tasks','os32_create_task','os32_reassign_task','os32_import_catalog','os32_import_preview','os32_import_commit'] loop
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sculpy_private' and p.proname=name loop execute 'grant execute on function '||f.sig||' to authenticated';end loop;
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('sculpy_os_client_detail_v32','sculpy_os_client_review','sculpy_os_update_client','sculpy_os_task_context','sculpy_os_tasks_v32','sculpy_os_create_task_v32','sculpy_os_reassign_task','sculpy_os_import_catalog','sculpy_os_import_preview','sculpy_os_import_commit') loop
  execute 'revoke all on function '||f.sig||' from public,anon,authenticated';execute 'grant execute on function '||f.sig||' to authenticated';
 end loop;
end $$;
commit;
