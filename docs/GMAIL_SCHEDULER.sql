-- Review and run only in an approved Supabase test/production environment.
-- Requires pg_cron, pg_net, Vault, deployed sculpy-gmail and an OAuth connection.
-- Store the same random worker key in Edge secret GMAIL_WORKER_KEY and Vault
-- under sculpy_gmail_worker_key. Never paste the value into this file or Git.
-- Replace YOUR_PROJECT_REF with the approved environment's project ref.
do $$begin
 if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net') then raise exception 'Enable pg_cron and pg_net in the approved environment first';end if;
 if not exists(select 1 from vault.decrypted_secrets where name='sculpy_gmail_worker_key') then raise exception 'Worker key missing from Vault';end if;
 if exists(select 1 from cron.job where jobname='sculpy-gmail-sync') then perform cron.unschedule('sculpy-gmail-sync');end if;
 perform cron.schedule('sculpy-gmail-sync','*/5 * * * *',$job$
  select net.http_post(
   url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/sculpy-gmail?action=worker',
   headers:=jsonb_build_object('content-type','application/json','x-gmail-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='sculpy_gmail_worker_key' limit 1)),
   body:='{}'::jsonb,timeout_milliseconds:=90000
  );
 $job$);
end$$;
-- Rollback: select cron.unschedule('sculpy-gmail-sync'); then disconnect in UI.
