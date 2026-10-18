-- Production acceptance: synthetic rows exist only inside this rolled-back transaction.
begin;
do $$declare actor uuid;cid uuid;bid uuid;sid uuid;pid uuid;r jsonb;d jsonb;v bigint;begin
 select id into actor from public.profiles where active and role='operations' limit 1;
 if actor is null then raise exception 'Active operations account required';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select id into sid from public.services where code='wedding';
 insert into public.clients(display_name) values('SCULPY rollback-only acceptance') returning id into cid;
 insert into public.bookings(client_id,service_id,starts_at) values(cid,sid,'2027-07-10T14:00:00Z') returning id into bid;
 perform public.sculpy_wedding_command(gen_random_uuid(),'confirm_contract',jsonb_build_object('confirmed',true,'reason','Rollback-only verification','bookingId',bid,'version',1,'amount',2000,'effectiveAt','2026-09-12','dateQuality','verified'));
 d:=public.sculpy_wedding_detail(bid);if d->>'receivedCents'<>'0' or d->>'outstandingCents'<>'200000' then raise exception 'Unsigned deposit acceptance failed';end if;
 r:=public.sculpy_wedding_command(gen_random_uuid(),'record_payment',jsonb_build_object('confirmed',true,'reason','Rollback-only verification','bookingId',bid,'kind','deposit','amount',600,'paidAt','2026-09-20','method','etransfer'));pid:=(r->>'paymentId')::uuid;
 perform public.sculpy_wedding_command(gen_random_uuid(),'amend_contract',jsonb_build_object('confirmed',true,'reason','Rollback-only added family service','bookingId',bid,'version',(d->>'version')::bigint,'amount',2500,'effectiveAt','2026-10-02'));
 perform public.sculpy_wedding_command(gen_random_uuid(),'record_payment',jsonb_build_object('confirmed',true,'reason','Rollback-only balance','bookingId',bid,'kind','balance','amount',1900,'paidAt','2026-10-05','method','etransfer'));
 perform public.sculpy_wedding_command(gen_random_uuid(),'record_payment',jsonb_build_object('confirmed',true,'reason','Rollback-only refund','bookingId',bid,'kind','refund','amount',200,'paidAt','2026-10-10','method','etransfer','refundOf',pid));
 d:=public.sculpy_wedding_detail(bid);if d->>'receivedCents'<>'230000' or d->>'outstandingCents'<>'20000' or jsonb_array_length(d->'payments')<>3 then raise exception 'Cash/refund acceptance failed';end if;
 r:=public.sculpy_wedding_report('2026-09-01','2026-09-30','2026-10-18',2027,null,null);
 if r#>>'{sales,signedCents}'<>'200000' or r#>>'{cash,netCents}'<>'60000' then raise exception 'Separate-date acceptance failed';end if;
 r:=public.sculpy_wedding_report('2026-10-01','2026-10-18','2026-10-18',2027,null,null);
 if r#>>'{sales,changeCents}'<>'50000' or r#>>'{cash,netCents}'<>'170000' or r#>>'{forward,amountCents}'<>'250000' or r#>>'{bookingPace,comparable}'<>'false' then raise exception 'Wedding analytics acceptance failed';end if;
 perform public.sculpy_wedding_command(gen_random_uuid(),'save_lead',jsonb_build_object('confirmed',true,'reason','Rollback-only lead','name','Acceptance fixture','email','acceptance@example.test','service','Bridal','serviceType','wedding','source','instagram','status','won','bookingId',bid,'firstContact','2026-08-01'));
 r:=public.sculpy_wedding_report('2026-08-01','2026-08-31','2026-10-18',2027,null,null);
 if r#>>'{leads,won}'<>'1' or r#>>'{leads,count}'<>'1' or r#>>'{leads,signedCents}'<>'200000' then raise exception 'Cohort acceptance failed';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.sculpy_wedding_report('2026-10-01','2026-10-18','2026-10-18',2027,null,null);raise exception 'Inactive actor unexpectedly allowed';exception when insufficient_privilege then null;end;
end$$;
rollback;
select jsonb_build_object('bookings',(select count(*) from public.bookings),'clients',(select count(*) from public.clients),'payments',(select count(*) from public.payments),'enquiries',(select count(*) from public.website_enquiries),'businessEvents',(select count(*) from public.booking_business_events),'anonReportExecute',has_function_privilege('anon','public.sculpy_wedding_report(date,date,date,integer,text,text)','execute'),'anonWebsiteExecute',has_function_privilege('anon','public.sculpy_submit_website_enquiry(jsonb,text)','execute')) result;
