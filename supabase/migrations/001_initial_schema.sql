-- Sculpy V1 production schema for Supabase/PostgreSQL.
-- Demo and production must use separate Supabase projects.
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','admin','operations','artist','read_only');
create type public.booking_status as enum ('inquiry','confirmed','completed','cancelled');
create type public.ai_draft_status as enum ('pending','confirmed','rejected');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null,
 role public.app_role not null default 'artist',
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.artists (
 id uuid primary key default gen_random_uuid(),
 slug text unique not null,
 profile_id uuid unique references public.profiles(id) on delete set null,
 name text not null,
 level text not null,
 bio text,
 specialties text[] not null default '{}',
 portrait_url text,
 member_type text not null default 'artist' check (member_type in ('artist','operations')),
 employment_status text not null default 'active' check (employment_status in ('active','inactive','profile_only')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.clients (
 id uuid primary key default gen_random_uuid(),
 display_name text not null,
 city text,
 birthday date,
 wedding_date date,
 referral_source text,
 lifecycle_status text not null default 'active' check (lifecycle_status in ('lead','active','past','archived')),
 preferences jsonb not null default '{}',
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);

create table public.client_private (
 client_id uuid primary key references public.clients(id) on delete cascade,
 phone text,
 email text,
 wechat text,
 instagram text,
 internal_notes text,
 updated_at timestamptz not null default now()
);

create table public.services (
 id uuid primary key default gen_random_uuid(),
 code text unique not null,
 name text not null,
 active boolean not null default true,
 default_price_cad numeric(10,2),
 created_at timestamptz not null default now()
);

create table public.venues (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 address text,
 website text,
 internal_notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.partners (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 partner_type text not null,
 email text,
 phone text,
 instagram text,
 website text,
 internal_notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.bookings (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id),
 service_id uuid references public.services(id),
 venue_id uuid references public.venues(id),
 parent_booking_id uuid references public.bookings(id),
 starts_at timestamptz not null,
 ends_at timestamptz,
 status public.booking_status not null default 'inquiry',
 price_cad numeric(10,2),
 deposit_cad numeric(10,2),
 balance_cad numeric(10,2),
 source text not null default 'manual',
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);

create table public.booking_artists (
 booking_id uuid not null references public.bookings(id) on delete cascade,
 artist_id uuid not null references public.artists(id),
 assignment_role text not null default 'lead',
 primary key (booking_id,artist_id)
);

create table public.booking_partners (
 booking_id uuid not null references public.bookings(id) on delete cascade,
 partner_id uuid not null references public.partners(id),
 primary key (booking_id,partner_id)
);

create table public.work_logs (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 author_id uuid not null references public.profiles(id),
 source text not null default 'manual' check (source in ('manual','sculpy_text','sculpy_voice','import')),
 raw_text text not null,
 summary text,
 structured_data jsonb not null default '{}',
 confirmed_by uuid references public.profiles(id),
 confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);

create table public.media (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid references public.bookings(id) on delete set null,
 client_id uuid references public.clients(id) on delete set null,
 uploaded_by uuid references public.profiles(id),
 storage_path text not null,
 media_type text not null default 'image',
 tags text[] not null default '{}',
 consent_status text not null default 'unknown' check (consent_status in ('unknown','internal_only','approved_public','denied')),
 created_at timestamptz not null default now(),
 deleted_at timestamptz
);

create table public.media_artists (
 media_id uuid not null references public.media(id) on delete cascade,
 artist_id uuid not null references public.artists(id),
 primary key (media_id,artist_id)
);

create table public.portfolio_items (
 id uuid primary key default gen_random_uuid(),
 artist_id uuid not null references public.artists(id),
 media_id uuid not null references public.media(id),
 collection text not null default 'personal',
 position integer not null default 0,
 publish_status text not null default 'candidate' check (publish_status in ('candidate','selected','published','archived')),
 selected_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 unique (artist_id,media_id,collection)
);

create table public.interactions (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 booking_id uuid references public.bookings(id) on delete set null,
 channel text not null,
 occurred_at timestamptz not null default now(),
 summary text not null,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);

create table public.reminders (
 id uuid primary key default gen_random_uuid(),
 client_id uuid references public.clients(id) on delete cascade,
 booking_id uuid references public.bookings(id) on delete cascade,
 assigned_to uuid references public.profiles(id),
 due_at timestamptz not null,
 reason text not null,
 status text not null default 'open' check (status in ('open','done','dismissed')),
 source text not null default 'manual',
 created_at timestamptz not null default now()
);

create table public.ai_drafts (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references public.profiles(id),
 booking_id uuid references public.bookings(id) on delete cascade,
 input_type text not null check (input_type in ('text','voice','image','search')),
 raw_input text,
 transcript_storage_path text,
 proposed_changes jsonb not null default '{}',
 model_name text,
 confidence numeric(4,3),
 status public.ai_draft_status not null default 'pending',
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);

create table public.audit_events (
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(id),
 entity_type text not null,
 entity_id uuid,
 action text not null,
 before_value jsonb,
 after_value jsonb,
 created_at timestamptz not null default now()
);

create index bookings_starts_at_idx on public.bookings(starts_at);
create index bookings_client_id_idx on public.bookings(client_id);
create index work_logs_booking_id_idx on public.work_logs(booking_id);
create index media_booking_id_idx on public.media(booking_id);
create index reminders_due_at_idx on public.reminders(due_at) where status='open';

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() and active=true $$;

create or replace function public.current_artist_id() returns uuid
language sql stable security definer set search_path=public
as $$ select id from public.artists where profile_id=auth.uid() and employment_status='active' $$;

create or replace function public.is_staff_manager() returns boolean
language sql stable security definer set search_path=public
as $$ select coalesce(public.current_app_role() in ('owner','admin','operations'),false) $$;

create or replace function public.is_system_admin() returns boolean
language sql stable security definer set search_path=public
as $$ select coalesce(public.current_app_role() in ('admin','operations'),false) $$;

create or replace function public.is_assigned_to_booking(target_booking uuid) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.booking_artists where booking_id=target_booking and artist_id=public.current_artist_id()) $$;

alter table public.profiles enable row level security;
alter table public.artists enable row level security;
alter table public.clients enable row level security;
alter table public.client_private enable row level security;
alter table public.services enable row level security;
alter table public.venues enable row level security;
alter table public.partners enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_artists enable row level security;
alter table public.booking_partners enable row level security;
alter table public.work_logs enable row level security;
alter table public.media enable row level security;
alter table public.media_artists enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.interactions enable row level security;
alter table public.reminders enable row level security;
alter table public.ai_drafts enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_read_self_or_manager on public.profiles for select using (id=auth.uid() or public.is_staff_manager());
create policy artists_read_authenticated on public.artists for select to authenticated using (true);
create policy artists_manage_manager on public.artists for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy clients_read_related on public.clients for select using (public.is_staff_manager() or exists(select 1 from public.bookings b where b.client_id=clients.id and public.is_assigned_to_booking(b.id)));
create policy clients_manage_manager on public.clients for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy client_private_manager_only on public.client_private for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy services_read_authenticated on public.services for select to authenticated using (true);
create policy services_manage_manager on public.services for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy venues_read_authenticated on public.venues for select to authenticated using (true);
create policy venues_manage_manager on public.venues for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy partners_read_authenticated on public.partners for select to authenticated using (true);
create policy partners_manage_manager on public.partners for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy bookings_read_assigned on public.bookings for select using (public.is_staff_manager() or public.is_assigned_to_booking(id));
create policy bookings_manage_manager on public.bookings for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy booking_artists_read_related on public.booking_artists for select using (public.is_staff_manager() or artist_id=public.current_artist_id() or public.is_assigned_to_booking(booking_id));
create policy booking_artists_manage_manager on public.booking_artists for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy booking_partners_read_related on public.booking_partners for select using (public.is_staff_manager() or public.is_assigned_to_booking(booking_id));
create policy booking_partners_manage_manager on public.booking_partners for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy work_logs_read_related on public.work_logs for select using (public.is_staff_manager() or public.is_assigned_to_booking(booking_id));
create policy work_logs_create_assigned on public.work_logs for insert with check (author_id=auth.uid() and (public.is_staff_manager() or public.is_assigned_to_booking(booking_id)));
create policy work_logs_update_author_or_manager on public.work_logs for update using (public.is_staff_manager() or author_id=auth.uid()) with check (public.is_staff_manager() or author_id=auth.uid());
create policy media_read_related on public.media for select using (public.is_staff_manager() or (booking_id is not null and public.is_assigned_to_booking(booking_id)));
create policy media_write_related on public.media for insert with check (uploaded_by=auth.uid() and (public.is_staff_manager() or (booking_id is not null and public.is_assigned_to_booking(booking_id))));
create policy media_artists_read_authenticated on public.media_artists for select to authenticated using (true);
create policy media_artists_manage_manager on public.media_artists for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy portfolio_read_authenticated on public.portfolio_items for select to authenticated using (true);
create policy portfolio_manage_own_or_manager on public.portfolio_items for all using (public.is_staff_manager() or artist_id=public.current_artist_id()) with check (public.is_staff_manager() or artist_id=public.current_artist_id());
create policy interactions_manager_only on public.interactions for all using (public.is_staff_manager()) with check (public.is_staff_manager());
create policy reminders_read_assigned on public.reminders for select using (public.is_staff_manager() or assigned_to=auth.uid());
create policy reminders_manage_assigned on public.reminders for all using (public.is_staff_manager() or assigned_to=auth.uid()) with check (public.is_staff_manager() or assigned_to=auth.uid());
create policy ai_drafts_read_own_or_manager on public.ai_drafts for select using (public.is_staff_manager() or created_by=auth.uid());
create policy ai_drafts_create_own on public.ai_drafts for insert with check (created_by=auth.uid());
create policy ai_drafts_update_own_or_manager on public.ai_drafts for update using (public.is_staff_manager() or created_by=auth.uid()) with check (public.is_staff_manager() or created_by=auth.uid());
create policy audit_read_system_admin on public.audit_events for select using (public.is_system_admin());
