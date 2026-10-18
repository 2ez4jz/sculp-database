-- Explicitly isolate internal acceptance probes from all customer analytics.
-- Only a privileged operator can set this flag; the public form cannot do so.
alter table public.website_enquiries add column is_test boolean not null default false;
alter table public.website_enquiries add constraint acceptance_probe_invalid_only check(not is_test or status='spam');
do $outer$declare def text;begin
 select pg_get_functiondef('sculpy_private.wedding_report(date,date,date,integer,text,text)'::regprocedure) into def;
 def:=replace(def,'from public.website_enquiries l where l.first_contact_at','from public.website_enquiries l where not l.is_test and l.first_contact_at');
 execute def;
end$outer$;

-- Keep an identifiable HTTP acceptance record for technical traceability without
-- changing or deleting customer rows. Both UI and analytics use this read scope.
create view public.website_enquiries_business with(security_invoker=true) as
select * from public.website_enquiries
where not is_test and not (coalesce(email,'')='sculpy-v23-acceptance@example.test'
 and name='SCULPY V2.3 internal acceptance' and coalesce(details,'') like 'Synthetic API acceptance probe;%');
revoke all on public.website_enquiries_business from public,anon,authenticated;
grant select on public.website_enquiries_business to authenticated;
do $outer$declare def text;begin
 select pg_get_functiondef('sculpy_private.wedding_report(date,date,date,integer,text,text)'::regprocedure) into def;
 def:=replace(def,'from public.website_enquiries l where not l.is_test and l.first_contact_at',
  'from public.website_enquiries l where not l.is_test and not (coalesce(l.email,'''')=''sculpy-v23-acceptance@example.test'' and l.name=''SCULPY V2.3 internal acceptance'' and coalesce(l.details,'''') like ''Synthetic API acceptance probe;%'') and l.first_contact_at');
 execute def;
end$outer$;
