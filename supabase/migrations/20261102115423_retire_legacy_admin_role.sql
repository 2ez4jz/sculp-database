-- Retire the unused production admin role without rebuilding an enum that is
-- referenced by existing function signatures, policies and historical migrations.
-- Owner/operations business rights and operations-only account administration
-- stay in their existing server-side authorization functions.
alter table public.profiles add constraint profiles_no_legacy_admin
 check (role <> 'admin'::public.app_role);
