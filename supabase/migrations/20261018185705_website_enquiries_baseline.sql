-- Retain the website pipeline already deployed on 2026-10-18. No customer seeds.
create table if not exists public.website_enquiries (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null unique,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 name text not null check(char_length(name) between 1 and 160),
 email text not null check(char_length(email) between 3 and 254), contact text, contact_method text,
 service text not null, artist text, event_date date, location text, party_size integer, timing text, details text,
 status text not null default 'pending' check(status in ('pending','contacted','qualified','won','lost','spam')),
 entry_channel text not null default 'website' check(entry_channel in ('website','manual')),
 attribution_source text not null default 'unknown', attribution_detail text,
 utm_source text, utm_medium text, utm_campaign text, landing_referrer text,
 notes text not null default '', booking_id uuid references public.bookings(id) on delete set null,
 converted_at timestamptz, handled_by uuid references public.profiles(id) on delete set null
);
alter table public.website_enquiries enable row level security;
revoke all on public.website_enquiries from public,anon,authenticated;
grant select,update on public.website_enquiries to authenticated;
grant select,insert on public.website_enquiries to service_role;
do $$begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='website_enquiries' and policyname='business admins view leads') then
  create policy "business admins view leads" on public.website_enquiries for select to authenticated using(public.is_business_admin());
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='website_enquiries' and policyname='business admins update leads') then
  create policy "business admins update leads" on public.website_enquiries for update to authenticated using(public.is_business_admin()) with check(public.is_business_admin());
 end if;
end$$;
