-- Default dry run. Load fresh positive captures into matching.foursquare_proofs.
-- Internal source registration only; native quality producers own reassessment.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
set local app.actor='system:foursquare-contact-evidence:v1';
do $repair$
#variable_conflict use_column
declare dry_run boolean:=true;r record;p jsonb;capture jsonb;source_id uuid;
 phone_result jsonb;phone_value text;after_row jsonb;names_match integer;changed integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 for r in
 with input as materialized(
  select value p from jsonb_array_elements(coalesce(nullif(current_setting('matching.foursquare_proofs',true),''),'[]')::jsonb)
 ), unique_ids as(select p->>'venue_id' id from input group by 1 having count(*)=1)
 select i.p,to_jsonb(v) old_venue,to_jsonb(o) old_organization,ci.name city_name,c.code country_code
 from input i join unique_ids u on u.id=i.p->>'venue_id'
 join venues v on v.id=(i.p->>'venue_id')::uuid
 join organizations o on o.id=v.organization_id and o.primary_venue_id=v.id
 join countries c on c.id=v.country_id join cities ci on ci.id=v.city_id and ci.country_id=c.id
 where v.duplicate_of_id is null and v.closed_at is null and o.duplicate_of_id is null and o.status='active'
 and o.roles=array['venue']::text[] and o.claim_status='unclaimed' and o.last_verified_at is null
 and o.field_provenance#>>'{identity,source}'='unified_location'
 and lower(btrim(o.name))=lower(btrim(v.name)) and o.city_id=v.city_id and o.country_id=v.country_id
 and v.website is null and v.phone is null and v.email is null
 and v.phone_e164 is null and v.foursquare_id is null and v.foursquare_rating is null
 and not(coalesce(v.platform_ids,'{}'::jsonb)?'foursquare') and coalesce(v.foursquare_data,'{}'::jsonb)='{}'::jsonb
 and o.website is null and o.phone is null and o.email is null and o.social='{}'::jsonb
 and not(o.field_provenance?|array['website','website_domain','phone','email'])
 and v.category not in('cruising','toilet','other')
 and v.name=i.p->>'name' and v.updated_at=(i.p->>'expected_updated_at')::timestamptz
 and v.latitude=(i.p->>'latitude')::numeric and v.longitude=(i.p->>'longitude')::numeric
 and v.address is not distinct from i.p->>'address'
 and v.country_id=(i.p->>'country_id')::uuid and v.city_id=(i.p->>'city_id')::uuid
 and c.code=i.p->>'country_code' and ci.name=i.p->>'city_name'
 and o.id=(i.p->>'organization_id')::uuid and i.p->>'human_reviewed'='false'
 and i.p->>'api_version'='2025-06-17'
 and i.p->>'query_url' like 'https://places-api.foursquare.com/places/search?%'
 and length(i.p->>'payload_text')<=1000000
 and encode(extensions.digest(i.p->>'payload_text','sha256'),'hex')=i.p->>'payload_sha256'
 and (i.p->>'observed_at')::timestamptz between now()-interval '1 hour' and now()+interval '5 minutes'
 and (i.p->'website_probe'->>'observed_at')::timestamptz between now()-interval '1 hour' and now()+interval '5 minutes'
 and i.p#>>'{website_probe,usable}'='true' and i.p#>>'{website_probe,status}'='200'
 and regexp_replace(public.extract_website_domain(i.p#>>'{website_probe,url}'),'^www\.','')
   =regexp_replace(public.extract_website_domain(i.p->>'website'),'^www\.','')
 and public.event_quality_url_is_safe(i.p->>'website') and public.platform_website_class(i.p->>'website') is null
 and public.extract_website_domain(i.p->>'website') is not null
 and rtrim(i.p->>'website','/')=rtrim(i.p#>>'{place,website}','/')
 and i.p#>>'{place,fsq_place_id}'~'^[a-f0-9]{24}$'
 and i.p->>'source_url'='https://foursquare.com/placemakers/review-place/'||(i.p#>>'{place,fsq_place_id}')
 and not exists(select 1 from venue_sources s where s.source_slug='foursquare' and s.source_entity_id=i.p#>>'{place,fsq_place_id}')
 and not exists(select 1 from venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
 and not exists(select 1 from venue_field_provenance f where f.venue_id=v.id and f.field in('website','phone') and f.is_winning)
 and not exists(select 1 from venue_review_queue q where q.venue_id=v.id and q.field in('website','phone') and q.status in('open','rejected'))
 and not exists(select 1 from content_revisions revision where revision.source_table in('venues','organizations')
  and revision.source_id in(v.id,o.id) and revision.actor_kind='human'
  and revision.changed_fields&&array['website','phone','email'])
 -- Additional contact evidence must not reopen a known source limitation.
 and not exists(select 1 from entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id
  and f.dimension in('editorial','media') and f.state in('source_unavailable','not_applicable'))
 order by v.id limit 20 for update of v,o skip locked
 loop
  p:=r.p;
  if not ((p->>'payload_text')::jsonb->'results' @> jsonb_build_array(p->'place')) then continue;end if;
  if jsonb_array_length((p->>'payload_text')::jsonb->'results')>=
    (case when p->>'query_url' like '%&limit=50&%' then 50 else 10 end) then continue;end if;
  -- Recompute unique identity and address evidence from the retained response.
  with places as(
   select value place from jsonb_array_elements((p->>'payload_text')::jsonb->'results')
  ), normalized as(
   select place,
    btrim(regexp_replace(lower(extensions.unaccent(place->>'name')),'[^[:alnum:]]+',' ','g')) source_name,
    btrim(regexp_replace(lower(extensions.unaccent(p->>'name')),'[^[:alnum:]]+',' ','g')) native_name,
    btrim(regexp_replace(lower(extensions.unaccent(r.city_name)),'[^[:alnum:]]+',' ','g')) city,
    btrim(regexp_replace(lower(extensions.unaccent(place#>>'{location,address}')),'[^[:alnum:]]+',' ','g')) source_address,
    btrim(regexp_replace(lower(extensions.unaccent(p->>'address')),'[^[:alnum:]]+',' ','g')) native_address
   from places where place#>>'{location,country}'=r.country_code
    and nullif(place->>'date_closed','')is null and coalesce(place->'unresolved_flags','[]'::jsonb)='[]'::jsonb
    and pg_input_is_valid(place->>'latitude','double precision') and pg_input_is_valid(place->>'longitude','double precision')
  ) select case when count(*)=1 and bool_and(n.place=p->'place') then 1 else 0 end into names_match from normalized n
  where (source_name=native_name or btrim(replace(' '||source_name||' ',' '||city||' ',' '))=btrim(replace(' '||native_name||' ',' '||city||' ',' ')))
   and (n.place->>'latitude')::double precision between -90 and 90 and (n.place->>'longitude')::double precision between -180 and 180
   and public.haversine_m((p->>'latitude')::numeric,(p->>'longitude')::numeric,
    (n.place->>'latitude')::numeric,(n.place->>'longitude')::numeric)<=case when nullif(btrim(p->>'address'),'')is null then 30 else 60 end
   and (nullif(btrim(p->>'address'),'')is null or (length(source_address)>=5
    and (position(' '||source_address||' ' in ' '||native_address||' ')>0 or position(' '||native_address||' ' in ' '||source_address||' ')>0)));
  if names_match<>1 then continue;end if;
  phone_result:=public.canonicalize_phone(p->>'phone',r.country_code);
  phone_value:=case when phone_result->>'verdict'='ok' and phone_result->>'country'=r.country_code then phone_result->>'e164' end;
  if dry_run then changed:=changed+1;continue;end if;
  capture:=jsonb_build_object('raw',p->'place','normalized',jsonb_build_object('name',p#>>'{place,name}',
   'contacts',jsonb_build_object('website',p->>'website','phone',phone_value)),
   'capture',p-'place','contract','foursquare_contact_capture:v1');
  insert into venue_sources(venue_id,source_slug,source_entity_id,source_url,payload,payload_hash,last_seen_at,is_primary)
   values((p->>'venue_id')::uuid,'foursquare',p#>>'{place,fsq_place_id}',p->>'source_url',capture,
    encode(extensions.digest(capture::text,'sha256'),'hex'),(p->>'observed_at')::timestamptz,false) returning id into source_id;
  update venues set website=p->>'website',phone=phone_value,updated_at=now() where id=(p->>'venue_id')::uuid;
  insert into venue_field_provenance(venue_id,field,source,value,confidence,is_winning,observed_at)
   select (p->>'venue_id')::uuid,field,'foursquare',to_jsonb(value),0.8,true,(p->>'observed_at')::timestamptz
   from (values('website',p->>'website'),('phone',phone_value)) facts(field,value) where value is not null;
  insert into venue_quality_signals(venue_id,signal_type,value,source,details)
   values((p->>'venue_id')::uuid,'enrichment',1,'foursquare-contact-evidence',jsonb_build_object(
    'source_id',source_id,'source_url',p->>'source_url','payload_sha256',p->>'payload_sha256','human_reviewed',false));
  select to_jsonb(v)into after_row from venues v where id=(p->>'venue_id')::uuid;
  if after_row-array['website','phone','phone_e164','website_domain','updated_at','foursquare_id','platform_ids','foursquare_data','last_synced_at']
   is distinct from r.old_venue-array['website','phone','phone_e164','website_domain','updated_at','foursquare_id','platform_ids','foursquare_data','last_synced_at']
   then raise exception 'Unexpected venue mutation %',p->>'venue_id';end if;
  if after_row->>'foursquare_id' is distinct from p#>>'{place,fsq_place_id}'
   or (after_row->'platform_ids')-'foursquare' is distinct from coalesce(r.old_venue->'platform_ids','{}'::jsonb)-'foursquare'
   or after_row#>>'{platform_ids,foursquare}' is distinct from p#>>'{place,fsq_place_id}'
   or after_row->>'phone_e164' is distinct from phone_value
   or after_row->'foursquare_data' is distinct from jsonb_build_object('last_source','foursquare',
    'observed_at',(p->>'observed_at')::timestamptz,'date_refreshed',p#>'{place,date_refreshed}',
    'date_closed',p#>'{place,date_closed}','unresolved_flags',coalesce(p#>'{place,unresolved_flags}','[]'::jsonb),
    'placemaker_url',p#>'{place,placemaker_url}')
   or (after_row->>'last_synced_at')::timestamptz is distinct from greatest(coalesce((r.old_venue->>'last_synced_at')::timestamptz,'-infinity'),(p->>'observed_at')::timestamptz)
   then raise exception 'Unexpected native source identity derivation';end if;
  select to_jsonb(o)into after_row from organizations o where id=(p->>'organization_id')::uuid;
  if after_row is distinct from r.old_organization then raise exception 'Unexpected direct business mutation';end if;
  changed:=changed+1;
 end loop;
 perform set_config('matching.foursquare_result',jsonb_build_object('dry_run',dry_run,'venues',changed)::text,false);
end $repair$;
select current_setting('matching.foursquare_result')::jsonb result;
commit;
