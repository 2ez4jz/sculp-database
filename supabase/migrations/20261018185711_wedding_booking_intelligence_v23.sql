-- Wedding Booking Intelligence. Incremental only; no fictional business rows.
alter table public.bookings
 add column contract_role text not null default 'contract' check(contract_role in ('contract','included')),
 add column confirmation_date_quality text not null default 'unknown' check(confirmation_date_quality in ('unknown','verified')),
 add constraint included_contract_parent check(contract_role<>'included' or parent_booking_id is not null);
create index bookings_contract_parent_idx on public.bookings(parent_booking_id) where parent_booking_id is not null;

create table public.booking_business_events (
 id bigint generated always as identity primary key,
 booking_id uuid not null references public.bookings(id),
 event_type text not null check(event_type in ('confirmation','amendment','cancellation','reschedule','completion','baseline')),
 effective_at timestamptz, recorded_at timestamptz not null default now(),
 amount numeric(12,2) check(amount is null or amount>=0),
 delta numeric(12,2), currency char(3) not null,
 service_at timestamptz not null, service_code text,
 state public.booking_status not null, evidence text not null,
 actor_id uuid references public.profiles(id), request_id uuid,
 unique(booking_id,request_id)
);
create unique index booking_one_confirmation on public.booking_business_events(booking_id) where event_type='confirmation';
create index booking_events_asof_idx on public.booking_business_events(booking_id,effective_at desc,id desc);
create index booking_events_type_time_idx on public.booking_business_events(event_type,effective_at);
alter table public.booking_business_events enable row level security;
revoke all on public.booking_business_events from public,anon,authenticated;
create policy booking_business_events_admin on public.booking_business_events for select to authenticated using((select public.is_business_admin()));

create table sculpy_private.wedding_coverage (
 id boolean primary key default true check(id), starts_at timestamptz not null default now()
);
insert into sculpy_private.wedding_coverage(id) values(true);
create table sculpy_private.wedding_requests (
 request_id uuid primary key, actor_id uuid not null, action text not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
grant usage on schema sculpy_private to service_role;
create table sculpy_private.enquiry_limits (
 bucket text primary key, window_start timestamptz not null, n integer not null
);
alter table sculpy_private.wedding_requests enable row level security;
alter table sculpy_private.wedding_coverage enable row level security;
alter table sculpy_private.enquiry_limits enable row level security;
revoke all on sculpy_private.wedding_requests,sculpy_private.wedding_coverage,sculpy_private.enquiry_limits from public,anon,authenticated;

alter table public.website_enquiries drop constraint website_enquiries_status_check;
alter table public.website_enquiries add constraint website_enquiries_status_check
 check(status in ('pending','contacted','qualified','quoted','won','lost','spam'));
alter table public.website_enquiries alter column email drop not null;
alter table public.website_enquiries
 add column service_type text,
 add column original_details text,
 add column submission_fingerprint text,
 add column first_contact_at timestamptz not null default now(),
 add column contacted_at timestamptz, add column quoted_at timestamptz,
 add column quoted_amount numeric(12,2) check(quoted_amount is null or quoted_amount>=0),
 add column last_contact_at timestamptz, add column lost_reason text,
 add column revision integer not null default 1;
-- Existing submitted date is evidence for first contact, not a guessed sales date.
update public.website_enquiries set first_contact_at=created_at, original_details=details, service_type=case service when 'Bridal' then 'wedding' when 'Event Styling' then 'event' when 'Personal Styling' then 'personal' when 'Commercial Beauty' then 'commercial' when 'Photoshoot Styling' then 'photoshoot' when '1-on-1 Styling Lesson' then 'education' when 'Group Styling Class' then 'education' else lower(service) end;
alter table public.bookings add column originating_enquiry_id uuid references public.website_enquiries(id);
create index bookings_originating_enquiry_idx on public.bookings(originating_enquiry_id) where originating_enquiry_id is not null;
create index enquiry_cohort_source_idx on public.website_enquiries(first_contact_at,attribution_source);
create index enquiry_booking_idx on public.website_enquiries(booking_id) where booking_id is not null;
create index enquiry_owner_idx on public.website_enquiries(handled_by) where handled_by is not null;
revoke update on public.website_enquiries from authenticated;

alter table public.payments
 add column payment_kind text not null default 'unclassified' check(payment_kind in ('unclassified','deposit','balance','refund')),
 add column refund_of uuid references public.payments(id),
 add column request_id uuid unique,
 add constraint payment_refund_direction check((payment_kind='refund')=(refund_of is not null));
create index payments_refund_idx on public.payments(refund_of) where refund_of is not null;
create unique index payments_external_reference_unique on public.payments(lower(trim(external_reference)))
 where external_reference is not null and trim(external_reference)<>'' and status='succeeded';

create function sculpy_private.contract_value(p_id uuid) returns numeric
language sql stable set search_path='' as $$
 select case when exists(select 1 from public.booking_business_events where booking_id=b.id and event_type in ('confirmation','amendment')) then b.price_cad else coalesce((select sum(line_total) from public.booking_services where booking_id=b.id),b.price_cad) end
 from public.bookings b where id=p_id
$$;
revoke all on function sculpy_private.contract_value(uuid) from public,anon,authenticated;

-- Do not manufacture historical signing prices. A baseline only describes state now.
insert into public.booking_business_events(booking_id,event_type,effective_at,amount,currency,service_at,service_code,state,evidence)
select b.id,'baseline',now(),sculpy_private.contract_value(b.id),b.currency,b.starts_at,s.code,b.status,
 'V2.3 launch baseline; original confirmation date/price not established'
from public.bookings b left join public.services s on s.id=b.service_id
where b.deleted_at is null and b.contract_role='contract' and b.status<>'inquiry';

create function sculpy_private.immutable_business_event() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'Business history is append-only';end$$;
revoke all on function sculpy_private.immutable_business_event() from public,anon,authenticated;
create trigger business_event_immutable before update or delete on public.booking_business_events
for each row execute function sculpy_private.immutable_business_event();

create function sculpy_private.guard_booking_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Dedicated commands supply actual/unknown signing dates and audited evidence.
 if current_setting('sculpy.v23_command',true) is distinct from 'on' then
  if (new.status in ('confirmed','cancelled') and new.status is distinct from old.status)
   or (old.status in ('confirmed','completed','cancelled') and new.status='inquiry')
   or new.price_cad is distinct from old.price_cad or new.confirmed_at is distinct from old.confirmed_at
   or new.currency is distinct from old.currency or new.service_id is distinct from old.service_id
   or new.contract_role is distinct from old.contract_role or new.parent_booking_id is distinct from old.parent_booking_id then
   raise exception '请使用签约、合同变更或取消操作，保留真实日期和金额历史。' using errcode='22023';
  end if;
  if new.starts_at is distinct from old.starts_at or new.status is distinct from old.status then
   insert into public.booking_business_events(booking_id,event_type,effective_at,amount,currency,service_at,service_code,state,evidence,actor_id)
   select new.id,case when new.status='completed' then 'completion' else 'reschedule' end,now(),
    sculpy_private.contract_value(old.id),new.currency,new.starts_at,(select code from public.services where id=new.service_id),new.status,'管理员订单编辑',auth.uid()
   where new.contract_role='contract';
  end if;
 end if;
 return new;
end$$;
revoke all on function sculpy_private.guard_booking_history() from public,anon,authenticated;
create trigger guard_booking_history before update on public.bookings for each row execute function sculpy_private.guard_booking_history();

-- One existing payments ledger. Positive amount + explicit direction; original
-- successful receipt is retained when separate dated refunds are appended.
create function sculpy_private.guard_payment() returns trigger
language plpgsql security definer set search_path='' as $$
declare original public.payments; inv public.invoices; booking_currency text;
begin
 if tg_op='UPDATE' and old.status in ('succeeded','refunded','partially_refunded') then
  raise exception '已入账记录不可覆盖，请追加有日期的退款。' using errcode='22023';
 end if;
 select * into inv from public.invoices where id=new.invoice_id and deleted_at is null;
 select currency into booking_currency from public.bookings where id=inv.booking_id;
 if inv.id is null or new.currency<>inv.currency or new.currency<>booking_currency then
  raise exception '支付与合同、发票币种不一致。' using errcode='22023';
 end if;
 if new.status='succeeded' and (new.paid_at is null or new.paid_at>now()) then
  raise exception '成功收退款必须有真实且不晚于现在的日期。' using errcode='22023';
 end if;
 if new.payment_kind='refund' then
  if new.status<>'succeeded' then raise exception '退款流水必须为成功状态。';end if;
  select * into original from public.payments where id=new.refund_of for update;
  if original.id is null or original.payment_kind='refund' or original.status not in ('succeeded','refunded','partially_refunded')
   or original.currency<>new.currency or original.invoice_id<>new.invoice_id or original.paid_at>new.paid_at
   or new.amount+coalesce((select sum(amount) from public.payments where refund_of=original.id and status='succeeded' and id<>new.id),0)>original.amount then
   raise exception '退款须关联原收款，日期及累计退款金额须有效。' using errcode='22023';
  end if;
 end if;
 return new;
end$$;
revoke all on function sculpy_private.guard_payment() from public,anon,authenticated;
create trigger validate_payment_v23 before insert or update on public.payments for each row execute function sculpy_private.guard_payment();

-- Historical date-only entries use local day start; today uses the actual operation time.
create function sculpy_private.business_time(p text) returns timestamptz
language plpgsql stable set search_path='' as $$begin
 if p is null or p='' then return null;end if;
 if p ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then if p::date=(now() at time zone 'America/Toronto')::date then return now();end if;return p::date::timestamp at time zone 'America/Toronto';end if;
 if p !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception '时间须包含时区，或使用多伦多日期。';end if;
 return p::timestamptz;
end$$;
revoke all on function sculpy_private.business_time(text) from public,anon,authenticated;

create function sculpy_private.wedding_command(p_request_id uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior sculpy_private.wedding_requests; b public.bookings;
 lead public.website_enquiries; previous jsonb; result jsonb; at_time timestamptz;
 value numeric; old_value numeric; inv public.invoices; pay public.payments; original public.payments;
 sid text; event_kind text; new_status public.booking_status; linked uuid; date_quality text;
begin
 if actor is null or not public.is_business_admin() then raise exception '仅管理员可执行经营操作。' using errcode='42501';end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload->'confirmed' is distinct from 'true'::jsonb then
  raise exception '请明确核对并确认操作。' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('wedding-request:'||p_request_id::text,0));
 select * into prior from sculpy_private.wedding_requests where request_id=p_request_id;
 if found then
  if prior.actor_id<>actor or prior.action<>p_action or prior.payload<>p_payload then raise exception '请求编号已使用。' using errcode='23505';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if length(trim(coalesce(p_payload->>'reason','')))=0 or length(p_payload->>'reason')>2000 then
  raise exception '请填写操作依据或备注。' using errcode='22023';end if;
 if p_action='save_lead' then
  if (p_payload-array['confirmed','reason','id','revision','name','email','contact','service','eventDate','details','source','sourceDetail','status','quote','owner','lastContact','bookingId','lostReason','firstContact','serviceType'])<>'{}'::jsonb then raise exception '不支持的询盘字段。';end if;
  if p_payload->>'id' is not null then
   select * into lead from public.website_enquiries where id=(p_payload->>'id')::uuid for update;
   if not found or lead.revision is distinct from (p_payload->>'revision')::integer then raise exception '询盘已变化，请刷新。' using errcode='40001';end if;
  end if;
  previous:=case when lead.id is null then null else to_jsonb(lead) end;
  if p_payload->>'status' is null or p_payload->>'status' not in ('pending','contacted','qualified','quoted','won','lost','spam')
   or length(trim(coalesce(p_payload->>'name',''))) not between 1 and 160
   or length(coalesce(p_payload->>'email',''))>254
   or (coalesce(p_payload->>'email','')<>'' and p_payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
   or length(trim(coalesce(p_payload->>'service',''))) not between 1 and 120
   or length(coalesce(p_payload->>'details',''))>4500 or length(coalesce(p_payload->>'contact',''))>240
   or length(coalesce(p_payload->>'sourceDetail',''))>300
   or p_payload->>'serviceType' is not null and not exists(select 1 from public.services where code=p_payload->>'serviceType')
   or p_payload->>'source' is null or p_payload->>'source' not in ('unknown','instagram','google','xiaohongshu','wechat','referral','planner','direct','other') then
   raise exception '询盘字段无效。' using errcode='22023';end if;
  if coalesce(p_payload->>'email','')='' and trim(coalesce(p_payload->>'contact',''))='' then raise exception '至少填写一种联系方式。';end if;
  if p_payload->>'status'='lost' and length(trim(coalesce(p_payload->>'lostReason','')))=0 then raise exception '请记录未成交原因。';end if;
  if p_payload->>'owner' is not null and not exists(select 1 from public.profiles where id=(p_payload->>'owner')::uuid and active and role in ('owner','operations')) then raise exception '负责人须为有效管理员。';end if;
  linked:=(p_payload->>'bookingId')::uuid;
  if lead.converted_at is not null and linked is distinct from lead.booking_id then raise exception '已成交询盘的合同关联不可覆盖；新合同请另建询盘。';end if;
  if linked is not null and not exists(select 1 from public.bookings where id=linked and deleted_at is null and contract_role='contract') then raise exception '关联订单必须为独立合同。';end if;
  if p_payload->>'status'='won' and not exists(select 1 from public.bookings where id=linked and status in ('confirmed','completed') and deleted_at is null) then raise exception '成交须关联已确认的正式合同。';end if;
  at_time:=coalesce(sculpy_private.business_time(p_payload->>'firstContact'),lead.first_contact_at,now());
  if lead.id is not null and p_payload->>'firstContact'=to_char(lead.first_contact_at at time zone 'America/Toronto','YYYY-MM-DD') then at_time:=lead.first_contact_at;end if;
  if at_time>now() or sculpy_private.business_time(p_payload->>'lastContact')>now() then raise exception '联系日期不能晚于现在。';end if;
  value:=(p_payload->>'quote')::numeric;
  if value is not null and (value<0 or round(value,2)<>value) then raise exception '报价金额无效。';end if;
  -- Empty email is permitted for manually recorded WeChat/phone leads only.
  if lead.id is null then
   insert into public.website_enquiries(submission_id,name,email,service,entry_channel,contact,first_contact_at,original_details)
   values(p_request_id,trim(p_payload->>'name'),nullif(p_payload->>'email',''),trim(p_payload->>'service'),'manual',p_payload->>'contact',at_time,p_payload->>'details') returning * into lead;
  end if;
  update public.website_enquiries set name=trim(p_payload->>'name'),email=nullif(p_payload->>'email',''),
   contact=p_payload->>'contact',service=trim(p_payload->>'service'),service_type=p_payload->>'serviceType',event_date=(p_payload->>'eventDate')::date,details=p_payload->>'details',
   attribution_source=p_payload->>'source',attribution_detail=p_payload->>'sourceDetail',status=p_payload->>'status',quoted_amount=value,
   contacted_at=case when p_payload->>'status' in ('contacted','qualified','quoted','won') then coalesce(contacted_at,now()) else contacted_at end,
   quoted_at=case when p_payload->>'status'='quoted' or value is not null then coalesce(quoted_at,now()) else quoted_at end,
   first_contact_at=at_time,last_contact_at=sculpy_private.business_time(p_payload->>'lastContact'),handled_by=(p_payload->>'owner')::uuid,
   lost_reason=p_payload->>'lostReason',booking_id=linked,notes=p_payload->>'reason',
   converted_at=case when p_payload->>'status'='won' then coalesce(converted_at,(select confirmed_at from public.bookings where id=linked),now()) else converted_at end,
   revision=revision+1,updated_at=now() where id=lead.id returning * into lead;
  if lead.status='won' and lead.converted_at<lead.first_contact_at then raise exception '首次询盘日期不能晚于签约日期。';end if;
  if lead.status='won' then update public.bookings set originating_enquiry_id=coalesce(originating_enquiry_id,lead.id) where id=linked;end if;
  result:=jsonb_build_object('leadId',lead.id,'revision',lead.revision);
  insert into public.audit_events(actor_id,entity_type,entity_id,action,before_value,after_value) values(actor,'website_enquiry',lead.id,'save_lead',previous,to_jsonb(lead));
 elsif p_action in ('confirm_contract','amend_contract','cancel_contract','record_payment','include_service') then
  select * into b from public.bookings where id=(p_payload->>'bookingId')::uuid and deleted_at is null for update;
  if not found then raise exception '订单不存在。';end if;
  if p_action<>'record_payment' and b.edit_version is distinct from (p_payload->>'version')::bigint then raise exception '订单已变化，请重新读取。' using errcode='40001';end if;
  if b.currency<>'CAD' then raise exception '本轮只支持 CAD 合同操作，请先核对币种。';end if;
  previous:=to_jsonb(b);old_value:=sculpy_private.contract_value(b.id);
  perform set_config('sculpy.v23_command','on',true);
  if p_action='include_service' then
   if (p_payload-array['confirmed','reason','bookingId','version','parentId'])<>'{}'::jsonb then raise exception '不支持的服务关联字段。';end if;
   if b.status<>'inquiry' or exists(select 1 from public.booking_business_events where booking_id=b.id) then raise exception '已签约合同不能改成附属服务。';end if;
   linked:=(p_payload->>'parentId')::uuid;
   if linked is null or linked=b.id or not exists(select 1 from public.bookings where id=linked and contract_role='contract' and client_id=b.client_id and deleted_at is null)
    or exists(select 1 from public.bookings where parent_booking_id=b.id) then raise exception '附属服务须关联同一客户的独立合同，且不允许循环。';end if;
   update public.bookings set parent_booking_id=linked,contract_role='included',status='confirmed' where id=b.id returning * into b;
  elsif b.contract_role<>'contract' then raise exception '此服务已包含在主合同，不可重复签约或收款。';
  elsif p_action='record_payment' then
   if (p_payload-array['confirmed','reason','bookingId','kind','amount','paidAt','method','reference','refundOf','invoiceId'])<>'{}'::jsonb then raise exception '不支持的支付字段。';end if;
   if not exists(select 1 from public.booking_business_events where booking_id=b.id and event_type in ('confirmation','baseline')) then raise exception '请先确认合同。';end if;
   value:=(p_payload->>'amount')::numeric;at_time:=sculpy_private.business_time(p_payload->>'paidAt');
   if value is null or value<=0 or round(value,2)<>value or at_time is null or at_time>now()
    or p_payload->>'kind' is null or p_payload->>'kind' not in ('deposit','balance','refund') then raise exception '支付金额、类型或日期无效。';end if;
   if p_payload->>'kind'='refund' then
    select * into original from public.payments where id=(p_payload->>'refundOf')::uuid for update;
    select * into inv from public.invoices where id=original.invoice_id and booking_id=b.id and deleted_at is null;
   elsif p_payload->>'invoiceId' is not null then
    select * into inv from public.invoices where id=(p_payload->>'invoiceId')::uuid and booking_id=b.id and status<>'void' and deleted_at is null;
   else
    if (select count(*) from public.invoices where booking_id=b.id and status<>'void' and deleted_at is null)>1 then raise exception '订单有多张发票，请指定发票。';end if;
    select * into inv from public.invoices where booking_id=b.id and status<>'void' and deleted_at is null;
    if inv.id is null then
     insert into public.invoices(booking_id,subtotal,created_by,notes) values(b.id,coalesce(old_value,0),actor,'V2.3 simplified payment reference') returning * into inv;
    end if;
   end if;
   if inv.id is null then raise exception '请选择有效的关联发票或原收款。';end if;
   if nullif(trim(p_payload->>'reference'),'') is null and exists(select 1 from public.payments where invoice_id=inv.id and payment_kind=p_payload->>'kind' and amount=value and (paid_at at time zone 'America/Toronto')::date=(at_time at time zone 'America/Toronto')::date and method=(p_payload->>'method')::public.payment_method and status='succeeded' and refund_of is not distinct from case when p_payload->>'kind'='refund' then original.id end) then raise exception '疑似重复收退款；若为另一笔，请提供不同转账编号。' using errcode='23505';end if;
   if p_payload->>'kind'<>'refund' and b.status='cancelled' then raise exception '已取消合同仅支持退款。';end if;
   insert into public.payments(invoice_id,amount,currency,method,status,paid_at,external_reference,internal_notes,created_by,payment_kind,refund_of,request_id)
   values(inv.id,value,'CAD',(p_payload->>'method')::public.payment_method,'succeeded',at_time,nullif(trim(p_payload->>'reference'),''),p_payload->>'reason',actor,p_payload->>'kind',case when p_payload->>'kind'='refund' then original.id end,p_request_id) returning * into pay;
   result:=jsonb_build_object('paymentId',pay.id,'bookingId',b.id);
  else
   if (p_payload-array['confirmed','reason','bookingId','version','amount','effectiveAt','dateQuality'])<>'{}'::jsonb then raise exception '不支持的合同字段。';end if;
   at_time:=sculpy_private.business_time(p_payload->>'effectiveAt');
   if at_time>now() then raise exception '业务日期不能晚于现在。';end if;
   if p_action='confirm_contract' then
    if b.status<>'inquiry' or exists(select 1 from public.booking_business_events where booking_id=b.id and event_type='confirmation') then raise exception '合同已签约，追加服务请用合同变更。';end if;
    date_quality:=p_payload->>'dateQuality';
    if date_quality is null or date_quality not in ('verified','unknown') or (date_quality='verified')<>(at_time is not null) then raise exception '请核实实际签约日期，或明确标记未知。';end if;
    value:=(p_payload->>'amount')::numeric;event_kind:='confirmation';new_status:='confirmed';
   elsif p_action='amend_contract' then
    if b.status not in ('confirmed','completed') then raise exception '仅有效签约合同可改价。';end if;
    if at_time is null or at_time<coalesce(b.confirmed_at,at_time) then raise exception '变更日期须有效且不早于签约。';end if;
    value:=(p_payload->>'amount')::numeric;event_kind:='amendment';new_status:=b.status;
   else
    if b.status not in ('confirmed','completed') then raise exception '仅已确认合同可取消。';end if;
    if at_time is null or at_time<coalesce(b.confirmed_at,at_time) then raise exception '取消日期须有效且不早于签约。';end if;
    value:=old_value;event_kind:='cancellation';new_status:='cancelled';
   end if;
   if value is not null and (value<0 or round(value,2)<>value) then raise exception '合同金额无效。';end if;
   if p_action='amend_contract' and (value is null or old_value is null) then raise exception '合同变更须有原金额和新金额。';end if;
   if at_time is not null and exists(select 1 from public.booking_business_events where booking_id=b.id and effective_at>at_time and event_type<>'baseline') then raise exception '业务日期早于后续事件，请先核对历史顺序。';end if;
   -- Explicitly confirmed contract total includes every service line. Existing
   -- lines remain the agreed service breakdown; the event records negotiated
   -- total changes, without creating a second contract or counting lines twice.
   update public.bookings set status=new_status,price_cad=case when p_action='cancel_contract' then price_cad else value end,
    confirmed_at=case when p_action='confirm_contract' then at_time else confirmed_at end,
    confirmation_date_quality=case when p_action='confirm_contract' then date_quality else confirmation_date_quality end,
    cancelled_at=case when p_action='cancel_contract' then at_time else cancelled_at end where id=b.id returning * into b;
   select code into sid from public.services where id=b.service_id;
   insert into public.booking_business_events(booking_id,event_type,effective_at,amount,delta,currency,service_at,service_code,state,evidence,actor_id,request_id)
   values(b.id,event_kind,at_time,value,case when event_kind='confirmation' then value when event_kind='amendment' then value-old_value else -value end,b.currency,b.starts_at,sid,b.status,p_payload->>'reason',actor,p_request_id);
  end if;
  perform set_config('sculpy.v23_command','off',true);
  result:=coalesce(result,jsonb_build_object('bookingId',b.id,'version',b.edit_version));
 else raise exception '不支持的经营操作。' using errcode='22023';end if;
 insert into sculpy_private.wedding_requests(request_id,actor_id,action,payload,result) values(p_request_id,actor,p_action,p_payload,result);
 return result||jsonb_build_object('replayed',false);
end$$;
revoke all on function sculpy_private.wedding_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function sculpy_private.wedding_command(uuid,text,jsonb) to authenticated;
create function public.sculpy_wedding_command(p_request_id uuid,p_action text,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.wedding_command(p_request_id,p_action,p_payload)$$;
revoke all on function public.sculpy_wedding_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.sculpy_wedding_command(uuid,text,jsonb) to authenticated;

create function sculpy_private.cents(n numeric) returns text language sql immutable set search_path='' as $$select (round(coalesce(n,0)*100))::numeric(30,0)::text$$;
revoke all on function sculpy_private.cents(numeric) from public,anon,authenticated;
create function sculpy_private.sales_metrics(f timestamptz,t timestamptz,p_service text default null) returns jsonb
language sql stable set search_path='' as $$
 with e as (select * from public.booking_business_events where effective_at>=f and effective_at<t
  and effective_at<=now() and (p_service is null or service_code=p_service)), a as (
 select count(*) filter(where event_type='confirmation') count,
 count(*) filter(where event_type='confirmation' and (amount is null or currency<>'CAD')) unknown,
 sum(amount) filter(where event_type='confirmation' and currency='CAD') signed,
 avg(amount) filter(where event_type='confirmation' and currency='CAD') average,
 sum(delta) filter(where event_type='amendment' and currency='CAD') changes,
 sum(amount) filter(where event_type='cancellation' and currency='CAD') cancelled from e)
 select jsonb_build_object('count',count,'unknownAmountCount',unknown,'signedCents',sculpy_private.cents(signed),
 'averageCents',case when count>unknown then sculpy_private.cents(average) end,
 'changeCents',sculpy_private.cents(changes),'cancelledCents',sculpy_private.cents(cancelled),
 'netChangeCents',sculpy_private.cents(coalesce(signed,0)+coalesce(changes,0)-coalesce(cancelled,0))) from a
$$;
revoke all on function sculpy_private.sales_metrics(timestamptz,timestamptz,text) from public,anon,authenticated;

create function sculpy_private.booking_pace(obs timestamptz,yr integer) returns jsonb
language sql stable set search_path='' as $$
 with latest as (
 select distinct on(booking_id) * from public.booking_business_events
 where effective_at<obs and effective_at is not null
 order by booking_id,effective_at desc,id desc), scoped as (
 select * from latest where state in ('confirmed','completed') and service_code='wedding'
 and extract(year from service_at at time zone 'America/Toronto')=yr), months as (
 select to_char(service_at at time zone 'America/Toronto','MM') as month,count(*) count,
 sculpy_private.cents(sum(amount) filter(where currency='CAD')) amount_cents from scoped group by 1)
 select jsonb_build_object('observation',obs,'serviceYear',yr,
 'comparable',obs>=(select starts_at from sculpy_private.wedding_coverage where id)
  and not exists(select 1 from public.booking_business_events where effective_at is null and service_code='wedding')
  and not exists(select 1 from scoped where amount is null or currency<>'CAD'),
 'count',(select count(*) from scoped),'amountCents',(select sculpy_private.cents(sum(amount) filter(where currency='CAD')) from scoped),
 'averageCents',(select case when count(amount) filter(where currency='CAD')>0 then sculpy_private.cents(avg(amount) filter(where currency='CAD')) end from scoped),
 'unknownAmountCount',(select count(*) from scoped where amount is null or currency<>'CAD'),
 'months',coalesce((select jsonb_agg(to_jsonb(months) order by month) from months),'[]'::jsonb))
$$;
revoke all on function sculpy_private.booking_pace(timestamptz,integer) from public,anon,authenticated;

create function sculpy_private.wedding_report(p_from date,p_to date,p_observation date,p_service_year integer,p_source text,p_service text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f timestamptz;t timestamptz;obs timestamptz;peer_obs timestamptz;today date:=(now() at time zone 'America/Toronto')::date;
 previous_from date;previous_to date;previous_kind text;
 sales jsonb;peer jsonb;last_year jsonb;pace jsonb;peer_pace jsonb;result jsonb;
begin
 if auth.uid() is null or not public.is_business_admin() then raise exception '仅管理员可查看经营分析。' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>732 or p_observation is null or p_observation>today
 or p_service_year is null or p_service_year not between 2000 and 2100
 or p_service is not null and not exists(select 1 from public.services where code=p_service)
 or p_source is not null and (length(p_source)>100 or length(p_source)=0) then raise exception '分析时间或筛选范围无效。' using errcode='22023';end if;
 f:=p_from::timestamp at time zone 'America/Toronto';t:=(p_to+1)::timestamp at time zone 'America/Toronto';
 obs:=least(now(),(p_observation+1)::timestamp at time zone 'America/Toronto');
 peer_obs:=((obs at time zone 'America/Toronto')-interval '1 year') at time zone 'America/Toronto';
 sales:=sculpy_private.sales_metrics(f,t,p_service);
 -- Previous equal-length calendar window; YoY uses the same local boundaries.
 previous_from:=p_from-(p_to-p_from+1);previous_to:=p_from;previous_kind:='equal_previous_window';
 if extract(day from p_from)=1 and date_trunc('month',p_from::timestamp)=date_trunc('month',p_to::timestamp) then
  previous_from:=(p_from-interval '1 month')::date;
  previous_to:=case when p_to=(p_from+interval '1 month'-interval '1 day')::date then p_from else least(previous_from+(p_to-p_from+1),p_from) end;
  previous_kind:='previous_calendar_month_aligned';
 end if;
 peer:=sculpy_private.sales_metrics(previous_from::timestamp at time zone 'America/Toronto',previous_to::timestamp at time zone 'America/Toronto',p_service);
 last_year:=sculpy_private.sales_metrics((p_from::timestamp-interval '1 year') at time zone 'America/Toronto',(p_to::timestamp+interval '1 day'-interval '1 year') at time zone 'America/Toronto',p_service);
 pace:=sculpy_private.booking_pace(obs,p_service_year);peer_pace:=sculpy_private.booking_pace(peer_obs,p_service_year-1);
 with contracts as (
  select b.*,s.code,sculpy_private.contract_value(b.id) value,
   coalesce((select sum(case when p.payment_kind='refund' then -p.amount else p.amount end) from public.payments p join public.invoices i on i.id=p.invoice_id
    where i.booking_id=b.id and p.status in ('succeeded','refunded','partially_refunded') and p.currency=b.currency and p.paid_at<=now()),0) received
  from public.bookings b left join public.services s on s.id=b.service_id where b.deleted_at is null and b.contract_role='contract'
 ), receipts as (
  select p.*,i.booking_id from public.payments p join public.invoices i on i.id=p.invoice_id
  where p.status in ('succeeded','refunded','partially_refunded') and p.paid_at<=now()
 ), cash as (
  select sculpy_private.cents(sum(amount) filter(where payment_kind='deposit')) deposit,
   sculpy_private.cents(sum(amount) filter(where payment_kind='balance')) balance,
   sculpy_private.cents(sum(amount) filter(where payment_kind='refund')) refund,
   sculpy_private.cents(sum(case when payment_kind='refund' then -amount else amount end)) net,
   count(*) filter(where payment_kind='unclassified') unclassified
  from receipts where currency='CAD' and paid_at>=f and paid_at<t
 ), cohort as (
  select l.* from public.website_enquiries l where l.first_contact_at>=f and l.first_contact_at<t
  and (p_source is null or l.attribution_source=p_source) and (p_service is null or l.service_type=p_service)
 ), valid as (select * from cohort where status<>'spam'), converted_contracts as (
  select distinct e.booking_id,e.amount,e.currency from valid l join public.bookings b on b.originating_enquiry_id=l.id join public.booking_business_events e on e.booking_id=b.id and e.event_type='confirmation' where l.status='won'
 ), sources as (
  select l.attribution_source source,count(*) leads,count(*) filter(where l.status='won') won,
   count(*) filter(where l.status in ('pending','contacted','qualified','quoted')) open,
   round(100.0*count(*) filter(where l.status='won')/nullif(count(*),0),2) conversion_percent,
   count(distinct l.booking_id) filter(where l.status='won') contracts,
   (select sculpy_private.cents(sum(e.amount) filter(where e.currency='CAD')) from public.booking_business_events e
    where e.event_type='confirmation' and e.booking_id in (select b.id from valid v join public.bookings b on b.originating_enquiry_id=v.id where v.status='won' and v.attribution_source=l.attribution_source)) signed_cents,
   (select case when count(e.amount) filter(where e.currency='CAD')>0 then sculpy_private.cents(avg(e.amount) filter(where e.currency='CAD')) end from public.booking_business_events e
    where e.event_type='confirmation' and e.booking_id in (select b.id from valid v join public.bookings b on b.originating_enquiry_id=v.id where v.status='won' and v.attribution_source=l.attribution_source)) average_cents
  from valid l group by l.attribution_source
 ), forward_months as (
  select to_char(starts_at at time zone 'America/Toronto','YYYY-MM') as month,count(*) count,
   sculpy_private.cents(sum(value) filter(where currency='CAD')) amount_cents,
   count(*) filter(where value is null or currency<>'CAD') unknown_amount_count
  from contracts where status='confirmed' and code='wedding' and starts_at>=today::timestamp at time zone 'America/Toronto'
   and starts_at<(today::timestamp+interval '18 months') at time zone 'America/Toronto' group by 1
 ), pending_months as (
  select to_char(starts_at at time zone 'America/Toronto','YYYY-MM') as month,sculpy_private.cents(sum(greatest(value-received,0))) amount_cents
  from contracts where status in ('confirmed','completed') and currency='CAD' group by 1
 ), trend_months as (
  select g::date as month from generate_series(date_trunc('month',p_to::timestamp)-interval '11 months',date_trunc('month',p_to::timestamp),interval '1 month') g
 ), trends as (
  select to_char(m.month,'YYYY-MM') as month,sculpy_private.sales_metrics(m.month::timestamp at time zone 'America/Toronto',(m.month::timestamp+interval '1 month') at time zone 'America/Toronto',p_service) sales,
   (select sculpy_private.cents(sum(case when r.payment_kind='refund' then -r.amount else r.amount end)) from receipts r
    where r.currency='CAD' and r.paid_at>=m.month::timestamp at time zone 'America/Toronto' and r.paid_at<(m.month::timestamp+interval '1 month') at time zone 'America/Toronto') cash_cents from trend_months m
 ) select jsonb_build_object(
  'source','canonical_wedding_intelligence_v23','asOf',now(),'timezone','America/Toronto',
  'period',jsonb_build_object('from',p_from,'to',p_to,'sourceFilter',p_source,'serviceFilter',p_service),
  'sales',sales,'comparisons',jsonb_build_object('previousFrom',previous_from,'previousTo',previous_to-1,'previousKind',previous_kind,'previousWindow',peer,'lastYear',last_year,
   'previousDeltaCents',((sales->>'signedCents')::numeric-(peer->>'signedCents')::numeric)::text,
   'yearDeltaCents',((sales->>'signedCents')::numeric-(last_year->>'signedCents')::numeric)::text,
   'previousPercent',round(100*((sales->>'signedCents')::numeric-(peer->>'signedCents')::numeric)/nullif((peer->>'signedCents')::numeric,0),2),
   'yearPercent',round(100*((sales->>'signedCents')::numeric-(last_year->>'signedCents')::numeric)/nullif((last_year->>'signedCents')::numeric,0),2)),
  'forward',jsonb_build_object('serviceYear',p_service_year,'count',(select count(*) from contracts where status='confirmed' and code='wedding' and extract(year from starts_at at time zone 'America/Toronto')=p_service_year),
   'amountCents',(select sculpy_private.cents(sum(value) filter(where currency='CAD')) from contracts where status='confirmed' and code='wedding' and extract(year from starts_at at time zone 'America/Toronto')=p_service_year),
   'unknownAmountCount',(select count(*) from contracts where status='confirmed' and code='wedding' and extract(year from starts_at at time zone 'America/Toronto')=p_service_year and (value is null or currency<>'CAD')),
   'months',coalesce((select jsonb_agg(to_jsonb(forward_months) order by month) from forward_months),'[]'::jsonb)),
  'bookingPace',jsonb_build_object('current',pace,'peer',case when (peer_pace->>'comparable')::boolean then peer_pace else jsonb_build_object('observation',peer_obs,'serviceYear',p_service_year-1,'comparable',false) end,
   'comparable',(pace->>'comparable')::boolean and (peer_pace->>'comparable')::boolean,
   'countDelta',case when (pace->>'comparable')::boolean and (peer_pace->>'comparable')::boolean then (pace->>'count')::integer-(peer_pace->>'count')::integer end,
   'amountDeltaCents',case when (pace->>'comparable')::boolean and (peer_pace->>'comparable')::boolean then ((pace->>'amountCents')::numeric-(peer_pace->>'amountCents')::numeric)::text end),
  'cash',jsonb_build_object('depositCents',(select deposit from cash),'balanceCents',(select balance from cash),'refundCents',(select refund from cash),'netCents',(select net from cash),
   'unclassifiedReceiptCount',(select unclassified from cash),
   'outstandingCents',(select sculpy_private.cents(sum(greatest(value-received,0))) from contracts where status in ('confirmed','completed') and currency='CAD'),
   'creditCents',(select sculpy_private.cents(sum(greatest(received-value,0))) from contracts where status in ('confirmed','completed') and currency='CAD'),
   'outstandingUnknownCount',(select count(*) from contracts where status in ('confirmed','completed') and (value is null or currency<>'CAD')),
   'pendingMonths',coalesce((select jsonb_agg(to_jsonb(pending_months) order by month) from pending_months),'[]'::jsonb)),
  'leads',jsonb_build_object('count',(select count(*) from valid),'invalid',(select count(*) from cohort where status='spam'),
   'contacted',(select count(*) from valid where contacted_at is not null),'quoted',(select count(*) from valid where quoted_at is not null),
   'won',(select count(*) from valid where status='won'),'lost',(select count(*) from valid where status='lost'),
   'open',(select count(*) from valid where status in ('pending','contacted','qualified','quoted')),
   'conversionPercent',(select round(100.0*count(*) filter(where status='won')/nullif(count(*),0),2) from valid),
   'signedCents',(select sculpy_private.cents(sum(amount) filter(where currency='CAD')) from converted_contracts),
   'distinctContracts',(select count(*) from converted_contracts),
   'averageDaysToWon',(select round(avg(extract(epoch from (converted_at-first_contact_at))/86400),1) from valid where status='won' and converted_at>=first_contact_at),
   'sources',coalesce((select jsonb_agg(to_jsonb(sources) order by source) from sources),'[]'::jsonb),
   'lostReasons',coalesce((select jsonb_agg(to_jsonb(x)) from (select coalesce(lost_reason,'未记录') reason,count(*) count from valid where status='lost' group by 1)x),'[]'::jsonb)),
  'trends',coalesce((select jsonb_agg(to_jsonb(trends) order by month) from trends),'[]'::jsonb),
  'coverage',jsonb_build_object('historyStartsAt',(select starts_at from sculpy_private.wedding_coverage where id),
   'totalContracts',(select count(*) from contracts),'unknownConfirmationDates',(select count(*) from contracts where status<>'inquiry' and confirmation_date_quality='unknown'),
   'legacyRefundReviewCount',(select count(*) from public.payments where status in ('refunded','partially_refunded')),
   'undatedSuccessfulPayments',(select count(*) from public.payments where status in ('succeeded','refunded','partially_refunded') and paid_at is null),
   'nonCadPayments',(select count(*) from receipts where currency<>'CAD'),
   'comparisonComplete',(p_from::timestamp-interval '1 year') at time zone 'America/Toronto'>=(select starts_at from sculpy_private.wedding_coverage where id) and not exists(select 1 from contracts where status<>'inquiry' and confirmation_date_quality='unknown'),
   'note','历史覆盖前的空值不代表零业务；报价不计合同额；金额仅 CAD 已知部分。渠道及服务筛选用于询盘批次；服务筛选另用于签约趋势，现金与未来婚礼保持全局。')
 ) into result;
 return result;
end$$;
revoke all on function sculpy_private.wedding_report(date,date,date,integer,text,text) from public,anon,authenticated;
grant execute on function sculpy_private.wedding_report(date,date,date,integer,text,text) to authenticated;
create function public.sculpy_wedding_report(p_from date,p_to date,p_observation date,p_service_year integer,p_source text default null,p_service text default null) returns jsonb
language sql stable security invoker set search_path='' as $$select sculpy_private.wedding_report(p_from,p_to,p_observation,p_service_year,p_source,p_service)$$;
revoke all on function public.sculpy_wedding_report(date,date,date,integer,text,text) from public,anon,authenticated;
grant execute on function public.sculpy_wedding_report(date,date,date,integer,text,text) to authenticated;

create function sculpy_private.wedding_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare b public.bookings;result jsonb;received numeric;begin
 if auth.uid() is null or not public.is_business_admin() then raise exception '仅管理员可查看合同及收款。' using errcode='42501';end if;
 select * into b from public.bookings where id=p_id and deleted_at is null;
 if not found then raise exception '订单不存在。';end if;
 select coalesce(sum(case when p.payment_kind='refund' then -p.amount else p.amount end),0) into received
 from public.payments p join public.invoices i on i.id=p.invoice_id where i.booking_id=b.id and p.currency=b.currency and p.status in ('succeeded','refunded','partially_refunded') and p.paid_at<=now();
 select jsonb_build_object('bookingId',b.id,'version',b.edit_version,'status',b.status,'contractRole',b.contract_role,'parentId',b.parent_booking_id,
 'confirmedAt',b.confirmed_at,'dateQuality',b.confirmation_date_quality,'currency',b.currency,
 'amountCents',case when sculpy_private.contract_value(b.id) is not null then sculpy_private.cents(sculpy_private.contract_value(b.id)) end,
 'receivedCents',sculpy_private.cents(received),'outstandingCents',case when sculpy_private.contract_value(b.id) is not null then sculpy_private.cents(case when b.status='cancelled' then 0 else greatest(sculpy_private.contract_value(b.id)-received,0) end) end,
 'payments',coalesce((select jsonb_agg(to_jsonb(x) order by paid_at,id) from (select p.id,p.invoice_id,p.payment_kind,p.amount,p.status,p.paid_at,p.refund_of,p.external_reference from public.payments p join public.invoices i on i.id=p.invoice_id where i.booking_id=b.id)x),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(to_jsonb(x) order by id) from (select id,event_type,effective_at,recorded_at,amount,delta,state,service_at,evidence from public.booking_business_events where booking_id=b.id)x),'[]'::jsonb)) into result;
 return result;
end$$;
revoke all on function sculpy_private.wedding_detail(uuid) from public,anon,authenticated;
grant execute on function sculpy_private.wedding_detail(uuid) to authenticated;
create function public.sculpy_wedding_detail(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select sculpy_private.wedding_detail(p_id)$$;
revoke all on function public.sculpy_wedding_detail(uuid) from public,anon,authenticated;
grant execute on function public.sculpy_wedding_detail(uuid) to authenticated;

-- The website endpoint is the only anonymous entry. Durable limits and retry
-- equality are enforced in the database; no public table write grants.
create function sculpy_private.submit_website_enquiry(p_payload jsonb,p_bucket text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.website_enquiries; item public.website_enquiries; n integer; bucket_key text; window_time timestamptz:=date_trunc('hour',now());
begin
 if p_bucket is null or length(p_bucket)<>64 or p_bucket !~ '^[a-f0-9]+$' then raise exception 'Invalid rate bucket';end if;
 if p_payload is null or length(p_payload::text)>18000 or p_payload->>'submission_id' is null
 or length(trim(coalesce(p_payload->>'name',''))) not between 1 and 160
 or length(coalesce(p_payload->>'email',''))>254 or coalesce(p_payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or length(trim(coalesce(p_payload->>'service',''))) not between 1 and 120
 or length(trim(coalesce(p_payload->>'location',''))) not between 1 and 240
 or length(coalesce(p_payload->>'details',''))>4500 then raise exception 'Invalid enquiry';end if;
 perform pg_advisory_xact_lock(hashtextextended('enquiry:'||(p_payload->>'submission_id'),0));
 select * into old from public.website_enquiries where submission_id=(p_payload->>'submission_id')::uuid;
 if found then
  if (old.submission_fingerprint is not null and old.submission_fingerprint<>md5(p_payload::text)) or (old.submission_fingerprint is null and (old.name is distinct from p_payload->>'name' or old.email is distinct from lower(p_payload->>'email')
   or old.service is distinct from p_payload->>'service' or old.event_date is distinct from (p_payload->>'event_date')::date
   or old.details is distinct from p_payload->>'details' or old.contact is distinct from p_payload->>'contact'
   or old.location is distinct from p_payload->>'location')) then raise exception 'Submission ID conflict' using errcode='23505';end if;
  return jsonb_build_object('ok',true,'duplicate',true);
 end if;
 foreach bucket_key in array array['ip:'||p_bucket,'email:'||md5(lower(p_payload->>'email'))] loop
  insert into sculpy_private.enquiry_limits(bucket,window_start,n) values(bucket_key,window_time,1)
  on conflict(bucket) do update set n=case when enquiry_limits.window_start=window_time then enquiry_limits.n+1 else 1 end,window_start=window_time returning enquiry_limits.n into n;
  if n>(case when bucket_key like 'ip:%' then 10 else 3 end) then raise exception 'Rate limit exceeded' using errcode='P0429';end if;
 end loop;
 insert into public.website_enquiries(submission_id,name,email,service,service_type,contact,contact_method,artist,event_date,location,party_size,timing,details,original_details,submission_fingerprint,utm_source,utm_medium,utm_campaign,landing_referrer)
 values((p_payload->>'submission_id')::uuid,p_payload->>'name',lower(p_payload->>'email'),p_payload->>'service',
 case p_payload->>'service' when 'Bridal' then 'wedding' when 'Event Styling' then 'event' when 'Personal Styling' then 'personal' when 'Commercial Beauty' then 'commercial' when 'Photoshoot Styling' then 'photoshoot' when '1-on-1 Styling Lesson' then 'education' when 'Group Styling Class' then 'education' end,
 p_payload->>'contact',p_payload->>'contact_method',p_payload->>'artist',(p_payload->>'event_date')::date,p_payload->>'location',(p_payload->>'party_size')::integer,p_payload->>'timing',p_payload->>'details',p_payload->>'details',md5(p_payload::text),p_payload->>'utm_source',p_payload->>'utm_medium',p_payload->>'utm_campaign',p_payload->>'landing_referrer') returning * into item;
 return jsonb_build_object('ok',true);
end$$;
revoke all on function sculpy_private.submit_website_enquiry(jsonb,text) from public,anon,authenticated;
grant execute on function sculpy_private.submit_website_enquiry(jsonb,text) to service_role;
create function public.sculpy_submit_website_enquiry(p_payload jsonb,p_bucket text) returns jsonb
language sql security invoker set search_path='' as $$select sculpy_private.submit_website_enquiry(p_payload,p_bucket)$$;
revoke all on function public.sculpy_submit_website_enquiry(jsonb,text) from public,anon,authenticated;
grant execute on function public.sculpy_submit_website_enquiry(jsonb,text) to service_role;

-- Older clients still receive gross original receipts, never refunds as receipts.
do $outer$declare def text;begin
 select pg_get_functiondef('sculpy_private.monthly_report(text)'::regprocedure) into def;
 def:=replace(def,
  'and p.status in (''succeeded'',''refunded'',''partially_refunded'')',
  'and p.payment_kind<>''refund'' and p.status in (''succeeded'',''refunded'',''partially_refunded'')');
 def:=replace(def,'coalesce((select sum(bs.line_total) from public.booking_services bs where bs.booking_id=b.id),b.price_cad)','sculpy_private.contract_value(b.id)');
 execute def;
end$outer$;
