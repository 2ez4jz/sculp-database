-- Enable only the relations required for the deployed account service.
-- RLS remains enabled, and profile writes remain unavailable to browser roles.
grant select on public.profiles to authenticated;
grant select,insert,update,delete on public.profiles,public.audit_events to service_role;
