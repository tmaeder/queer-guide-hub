begin;
do $$
declare paris uuid; reunion uuid; france uuid; us uuid; ev uuid; foreign_venue uuid; complete_venue uuid; got uuid; blocked boolean;
begin
 select c.id,c.country_id into paris,france from cities c join countries co on co.id=c.country_id
 where c.wikidata_qid='Q160506' and co.code='FR' and c.duplicate_of_id is null;
 select c.id into reunion from cities c join countries co on co.id=c.country_id
 where c.name_normalized='saint denis' and co.code='RE' and c.duplicate_of_id is null;
 select id into us from countries where code='US' and duplicate_of_id is null;
 select id into ev from events where slug='apero-friendly-1';
 if paris is null or reunion is null or ev is null then raise exception 'Regression fixture absent'; end if;
 select city_id into got from city_resolve_or_create(p_name:='Saint-Denis',p_country_code:='FR',
   p_lat:=48.93876739,p_lng:=2.34770538,p_allow_create:=false);
 if got is distinct from paris then raise exception 'Saint-Denis resolved to wrong continent'; end if;
 select city_id into got from city_resolve_or_create(p_name:='Valence',p_country_code:='ES',
   p_lat:=39.4741241,p_lng:=-0.3858557,p_allow_create:=false);
 if not exists(select 1 from cities where id=got and wikidata_qid='Q8818') then raise exception 'Spanish Valence did not resolve to Valencia'; end if;
 blocked:=false;
 begin update events set city_id=reunion where id=ev;
 exception when check_violation then blocked:=true; end;
 if not blocked then raise exception 'Accepted a city 9,000km from the event'; end if;
 blocked:=false;
 begin update events set country_id=us,city_id=null where id=ev;
 exception when check_violation then blocked:=true; end;
 if not blocked then raise exception 'Accepted US country for a Paris coordinate'; end if;
 select v.id into foreign_venue from venues v join countries co on co.id=v.country_id
 where co.code='US' and v.duplicate_of_id is null and v.city_id is not null limit 1;
 if foreign_venue is null then raise exception 'Venue fixture absent'; end if;
 update venues set country_id=country_id where id=foreign_venue;
 blocked:=false;
 begin update events set venue_id=foreign_venue where id=ev;
 exception when check_violation then blocked:=true; end;
 if not blocked then raise exception 'Accepted a foreign venue on the Paris event'; end if;
 if not public.entity_location_country_matches(france,48.93876739,2.34770538) then raise exception 'Rejected legitimate France coordinates'; end if;
 if public.entity_location_country_matches(us,48.93876739,2.34770538) then raise exception 'Failed to detect country-coordinate contradiction'; end if;
 if not public.entity_location_country_matches(france,-20.8823,55.4504) then raise exception 'Broke legitimate overseas jurisdiction equivalence'; end if;
 if (select count(*) from pg_trigger where not tgisinternal and tgname='zzzz_location_consistency'
   and tgrelid=any(array['public.events'::regclass,'public.venues'::regclass,'public.hotels'::regclass,'public.organizations'::regclass]))<>4 then raise exception 'Missing consistency trigger'; end if;
 if (select count(*) from events where field_provenance->'latitude'->>'source'='retracted_wrong_city_centroid'
   and (latitude is not null or longitude is not null))<>0 then raise exception 'Retracted false map pins reappeared'; end if;
 if (select pg_get_functiondef('public.run_event_geo_fill(integer,boolean)'::regprocedure))
   not like '%retracted_wrong_city_centroid%' then raise exception 'Event geo fill may restore false map pins'; end if;
 select v.id into complete_venue from venues v join entity_location_jobs j
   on j.entity_table='venues' and j.entity_id=v.id
 where v.duplicate_of_id is null and v.city_id is not null and v.country_id is not null
   and nullif(btrim(v.postal_code),'') is not null and v.latitude is not null
   and v.longitude is not null and nullif(btrim(v.timezone),'') is not null limit 1;
 if complete_venue is null then raise exception 'Complete venue job fixture absent'; end if;
 update entity_location_jobs set status='no_match',last_error='old result'
   where entity_table='venues' and entity_id=complete_venue;
 update venues set postal_code=postal_code where id=complete_venue;
 if not exists(select 1 from entity_location_jobs j join venues v on v.id=j.entity_id
   where j.entity_table='venues' and j.entity_id=complete_venue and j.status='done'
     and j.last_error is null and j.fingerprint=entity_location_fingerprint(to_jsonb(v)))
   then raise exception 'Complete venue retained stale no_match job'; end if;
end $$;
rollback;
select 'namesake resolver, country and coordinate guards, and complete-job reconciliation passed' result;
