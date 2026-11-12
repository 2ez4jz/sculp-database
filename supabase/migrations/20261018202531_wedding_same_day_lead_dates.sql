-- Date-only first-contact entries must not be later than a same-day contract
-- merely because the administrator records the lead after confirming it.
do $migration$declare def text;old_text text;new_text text;begin
 select pg_get_functiondef('sculpy_private.wedding_command(uuid,text,jsonb)'::regprocedure) into def;
 old_text:=$old$at_time:=coalesce(sculpy_private.business_time(p_payload->>'firstContact'),lead.first_contact_at,now());$old$;
 new_text:=$new$at_time:=coalesce(case when p_payload->>'firstContact' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then (p_payload->>'firstContact')::date::timestamp at time zone 'America/Toronto' else sculpy_private.business_time(p_payload->>'firstContact') end,lead.first_contact_at,now());$new$;
 if position(old_text in def)=0 then raise exception 'Expected first-contact implementation not found';end if;
 execute replace(def,old_text,new_text);
end$migration$;
