-- Transactional production acceptance: fictional data only; every write rolls back.
begin;
do $$
declare actor uuid;service uuid;lead uuid;note uuid:=gen_random_uuid();summary uuid:=gen_random_uuid();request uuid:=gen_random_uuid();answer jsonb;linked jsonb;payload jsonb;ctx jsonb;label text:='V24 transactional fixture '||substr(gen_random_uuid()::text,1,8);
begin
 select id into actor from public.profiles where active and role in ('owner','operations') order by role limit 1;
 select id into service from public.services where active and code='wedding';
 if actor is null or service is null then raise exception 'Acceptance requires an existing active manager and service.';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 execute 'set local role authenticated';
 answer:=public.sculpy_wedding_command(gen_random_uuid(),'save_lead',jsonb_build_object('confirmed',true,'reason','V2.4 transactional acceptance; rollback','name',label,'contact','fictional-acceptance','service','Wedding','serviceType','wedding','source','unknown','status','pending','firstContact',to_char(now() at time zone 'America/Toronto','YYYY-MM-DD'),'details','Fictional source; no client information'));
 lead:=(answer->>'leadId')::uuid;
 payload:=jsonb_build_object('type','lead','id',lead,'text','Fictional communication; price remains unknown','kind','text','attachments','[]'::jsonb);
 perform public.sculpy_communication_command(note,'add_record',payload);
 answer:=public.sculpy_communication_command(note,'add_record',payload);
 if answer->'replayed' is distinct from 'true'::jsonb then raise exception 'Record replay failed.';end if;
 perform public.sculpy_communication_command(summary,'confirm_summary',jsonb_build_object('type','lead','id',lead,'sourceIds',jsonb_build_array(note),'confirmed',true,'content',jsonb_build_object('needs',jsonb_build_array('Fictional wedding'),'confirmed','[]'::jsonb,'pending',jsonb_build_array('Price pending'),'changes','[]'::jsonb,'followUp',jsonb_build_array('Review timing'))));
 ctx:=public.sculpy_communication_context('lead',lead,null,null);
 if (ctx->>'total')::int<>1 or (ctx->>'pending')::int<>0 or jsonb_array_length(ctx->'summaries')<>1 then raise exception 'Lead history/summary mismatch.';end if;
 payload:=jsonb_build_object('leadId',lead,'revision',2,'confirmed',true,'rawText','Fictional reviewed intake','recordedAt',now(),'draft',jsonb_build_object('clientId','','clientName',label,'city','Toronto','date','2027-07-24','time','10:00','serviceId',service::text,'artistId','','location','Fictional venue','details','Acceptance only','budget',''));
 linked:=public.sculpy_communication_command(request,'convert_lead',payload);
 answer:=public.sculpy_communication_command(request,'convert_lead',payload);
 if answer->'replayed' is distinct from 'true'::jsonb then raise exception 'Conversion replay failed.';end if;
 ctx:=public.sculpy_communication_context('booking',(linked->>'bookingId')::uuid,null,null);
 if (ctx->>'total')::int<>1 or jsonb_array_length(ctx->'summaries')<>1 then raise exception 'Conversion lost original history.';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform public.sculpy_communication_context('lead',lead,null,null);
  raise exception 'Unauthorized identity unexpectedly read originals.';
 exception when insufficient_privilege then null;end;
end$$;
rollback;
