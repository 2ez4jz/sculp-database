-- Hosted Supabase provides these extensions. Stock test Postgres skips infrastructure installation.
do $$declare k uuid;begin
 if exists(select 1 from pg_available_extensions where name='pg_net') then execute 'create extension if not exists pg_net';end if;
 if exists(select 1 from pg_available_extensions where name='pg_cron') then execute 'create extension if not exists pg_cron';end if;
 if to_regprocedure('vault.create_secret(text,text,text,uuid)') is not null or exists(select 1 from pg_namespace where nspname='vault') then
  select vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'sculpy-push-worker','SCULPY private scheduler credential') into k;
  update sculpy_private.push_config set worker_secret_id=k where id;
 end if;
 if exists(select 1 from pg_namespace where nspname='net') then
  execute 'revoke all on all tables in schema net from public,anon,authenticated';
 end if;
 if exists(select 1 from pg_namespace where nspname='cron') then
  perform cron.schedule('sculpy-push-worker','* * * * *','select sculpy_private.kick_push_worker();');
  update sculpy_private.push_config set scheduler_installed=true where id;
 end if;
end$$;
-- Worker URL and global enablement are set only after the Edge deployment is verified.
