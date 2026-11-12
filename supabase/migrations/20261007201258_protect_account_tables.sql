-- Browser roles must never truncate the account or audit tables, bypassing RLS.
revoke truncate, references, trigger on public.profiles, public.audit_events from anon, authenticated;
