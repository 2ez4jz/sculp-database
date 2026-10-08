-- Human detail view can read intake source; the existing AI query allowlist only
-- calls sculpy_context. Do not add raw intake text/new free-text fields to it.
create function public.sculpy_order_detail(p_booking_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select sculpy_private.context(p_booking_id,'',0)
$$;
revoke all on function public.sculpy_order_detail(uuid) from public,anon;
grant execute on function public.sculpy_order_detail(uuid) to authenticated;
create or replace function public.sculpy_context(p_booking_id uuid default null,p_query text default '',p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$
 with result as (select sculpy_private.context(p_booking_id,p_query,p_offset) as data)
 select (data-'intake') || jsonb_build_object('bookings',coalesce((select jsonb_agg(b-'service_details'-'budget_cad') from jsonb_array_elements(data->'bookings') b),'[]'::jsonb)) from result
$$;
-- Old default Supabase grants included non-DML capabilities; the APIs need none.
revoke truncate,references,trigger on public.bookings,public.clients,public.work_logs,public.booking_artists from anon,authenticated;
