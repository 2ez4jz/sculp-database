begin;

create function sculpy_private.jz_notification_devices() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active
               and username='sculp_jz' and role='operations') then
   raise exception 'Device overview unavailable' using errcode='42501';
 end if;
 return jsonb_build_object(
   'systemEnabled',coalesce((select enabled from sculpy_private.push_config where id),false),
   'devices',(select coalesce(jsonb_agg(jsonb_build_object(
     'account',p.username,'name',p.display_name,'ref',right(d.id::text,8),
     'platform',case
       when s.user_agent ilike '%iPhone%' then 'iPhone'
       when s.user_agent ilike '%iPad%' then 'iPad'
       when d.label='iPhone / iPad' then d.label
       when s.user_agent ilike '%Android%' then 'Android'
       when s.user_agent ilike '%Windows%' then 'Windows'
       when s.user_agent ilike '%Macintosh%' then 'Mac'
       when s.user_agent ilike '%CrOS%' then 'ChromeOS'
       when s.user_agent ilike '%Linux%' then 'Linux'
       else coalesce(nullif(d.label,''),'浏览器设备') end,
     'browser',case when s.user_agent ~* '(Edg|EdgiOS|EdgA)/' then 'Edge'
       when s.user_agent ~* '(Firefox|FxiOS)/' then 'Firefox'
       when s.user_agent ~* 'OPR/' then 'Opera'
       when s.user_agent ~* '(Chrome|CriOS)/' then 'Chrome'
       when s.user_agent ~* 'Version/.+Safari/' then 'Safari' end,
     'enabled',coalesce(f.enabled,false),
     'newEnquiry',p.role in ('operations','owner') and coalesce(f.new_enquiry,false),
     'overdue',p.role in ('operations','owner') and coalesce(f.overdue,false),
     'marketing',p.role in ('operations','owner'),
     'itinerary',case when sculpy_private.itinerary_recipient(p.id) then coalesce(f.itinerary,false) end
   ) order by p.username,d.created_at,d.id),'[]'::jsonb)
   from sculpy_private.push_devices d join public.profiles p on p.id=d.user_id
   join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
   left join sculpy_private.push_preferences f on f.user_id=p.id
   where p.active and d.active and sculpy_private.push_session_valid(d.user_id,d.session_id))
 );
end $$;

create function public.sculpy_jz_notification_devices() returns jsonb
language sql stable security invoker set search_path='' as $$
 select sculpy_private.jz_notification_devices()
$$;
revoke all on function sculpy_private.jz_notification_devices(),public.sculpy_jz_notification_devices() from public,anon,authenticated;
grant execute on function sculpy_private.jz_notification_devices(),public.sculpy_jz_notification_devices() to authenticated;
notify pgrst,'reload schema';
commit;
