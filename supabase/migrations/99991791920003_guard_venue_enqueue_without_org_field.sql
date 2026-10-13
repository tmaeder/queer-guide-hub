-- Venue updates can reach the incomplete-location branch. Access the
-- organisation-only field through the JSON representation of NEW so the
-- trigger works for both table row types.
create or replace function public.enqueue_entity_location()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare p jsonb:=to_jsonb(new); f text;
begin
 if new.duplicate_of_id is not null then return null; end if;
 f:=public.entity_location_fingerprint(p);
 if new.city_id is not null and new.country_id is not null and nullif(btrim(new.postal_code),'') is not null
   and new.latitude is not null and new.longitude is not null and nullif(btrim(new.timezone),'') is not null then
   update public.entity_location_jobs j set fingerprint=f,status='done',attempts=0,
     next_attempt_at=now(),last_error=null,updated_at=now()
   where j.entity_table=tg_table_name and j.entity_id=new.id
     and (j.fingerprint<>f or j.status<>'done' or j.last_error is not null);
   return null;
 end if;
 if nullif(btrim(new.address),'') is null and (new.latitude is null or new.longitude is null)
   and nullif(btrim(new.website),'') is null then return null; end if;
 -- A linked organisation receives the result from its location. Do not geocode twice.
 if tg_table_name='organizations' and p->>'primary_venue_id' is not null then return null; end if;
 insert into public.entity_location_jobs(entity_table,entity_id,fingerprint)
 values(tg_table_name,new.id,f)
 on conflict(entity_table,entity_id) do update set fingerprint=excluded.fingerprint,status='pending',attempts=0,
   next_attempt_at=now(),last_error=null,updated_at=now()
 where entity_location_jobs.fingerprint<>excluded.fingerprint;
 return null;
end $$;
revoke all on function public.enqueue_entity_location() from public,anon,authenticated;
