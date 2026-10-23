-- Default dry run. Internal registration of complete public source captures.
-- The native business producer owns reassessment; no issue is waived here.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
set local app.actor='system:overture-contact-evidence:v1';
do $repair$
#variable_conflict use_column
declare dry_run boolean:=true;r record;p jsonb;capture jsonb;source_id uuid;
 after_row jsonb;names_match integer;changed integer:=0;input jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 input:=coalesce(nullif(current_setting('matching.overture_proofs',true),''),'[]')::jsonb;
 if jsonb_typeof(input)<>'array' or jsonb_array_length(input)>20 then raise exception 'At most twenty source proofs required';end if;
 for r in
 with inputs as materialized(select value p from jsonb_array_elements(input)),
 unique_ids as(select p->>'venue_id' id from inputs group by 1 having count(*)=1)
 select i.p,to_jsonb(v) old_venue,to_jsonb(o) old_organization,ci.name city_name,c.code country_code
 from inputs i join unique_ids u on u.id=i.p->>'venue_id'
 join venues v on v.id=(i.p->>'venue_id')::uuid
 join organizations o on o.id=v.organization_id and o.primary_venue_id=v.id
 join countries c on c.id=v.country_id join cities ci on ci.id=v.city_id and ci.country_id=c.id
 where v.duplicate_of_id is null and v.closed_at is null and o.duplicate_of_id is null and o.status='active'
 and o.roles=array['venue']::text[] and o.claim_status='unclaimed' and o.last_verified_at is null
 and o.field_provenance#>>'{identity,source}'='unified_location'
 and lower(btrim(o.name))=lower(btrim(v.name)) and o.city_id=v.city_id and o.country_id=v.country_id
 and v.website is null and v.phone is null and v.email is null
 and o.website is null and o.phone is null and o.email is null and o.social='{}'::jsonb
 and not(o.field_provenance?|array['website','website_domain','phone','email'])
 and v.category not in('cruising','toilet','other')
 and v.name=i.p->>'name' and v.updated_at=(i.p->>'expected_updated_at')::timestamptz
 and v.latitude=(i.p->>'latitude')::numeric and v.longitude=(i.p->>'longitude')::numeric
 and v.address is not distinct from i.p->>'address'
 and v.country_id=(i.p->>'country_id')::uuid and v.city_id=(i.p->>'city_id')::uuid
 and c.code=i.p->>'country_code' and ci.name=i.p->>'city_name'
 and o.id=(i.p->>'organization_id')::uuid and i.p->>'human_reviewed'='false'
 and i.p->>'release'='2026-10-21.0' and i.p->>'window_complete'='true'
 and (i.p->>'window_rows')::integer between 1 and 150000
 and i.p->>'source_url'='https://stac.overturemaps.org/2026-10-21.0/places/place/collection.json'
 and jsonb_array_length(i.p->'assets') between 1 and 16
 and not exists(select 1 from jsonb_array_elements_text(i.p->'assets') a(url)
  where url!~'^https://overturemaps-us-west-2\.s3\.us-west-2\.amazonaws\.com/release/2026-10-21\.0/theme=places/type=place/[A-Za-z0-9.-]+\.parquet$')
 and v.longitude between (i.p#>>'{window_bounds,0}')::numeric and (i.p#>>'{window_bounds,2}')::numeric
 and v.latitude between (i.p#>>'{window_bounds,1}')::numeric and (i.p#>>'{window_bounds,3}')::numeric
 and least(
  public.haversine_m(v.latitude,v.longitude,v.latitude,(i.p#>>'{window_bounds,0}')::numeric),
  public.haversine_m(v.latitude,v.longitude,v.latitude,(i.p#>>'{window_bounds,2}')::numeric),
  public.haversine_m(v.latitude,v.longitude,(i.p#>>'{window_bounds,1}')::numeric,v.longitude),
  public.haversine_m(v.latitude,v.longitude,(i.p#>>'{window_bounds,3}')::numeric,v.longitude))>=60
 and length(i.p->>'payload_text')<=1000000
 and encode(extensions.digest(i.p->>'payload_text','sha256'),'hex')=i.p->>'payload_sha256'
 and (i.p->>'observed_at')::timestamptz between now()-interval '1 hour' and now()+interval '5 minutes'
 and (i.p->'website_probe'->>'observed_at')::timestamptz between now()-interval '1 hour' and now()+interval '5 minutes'
 and i.p#>>'{website_probe,usable}'='true' and i.p#>>'{website_probe,status}'='200'
 and i.p#>>'{website_probe,identity,name_match}'='true' and i.p#>>'{website_probe,identity,street_match}'='true'
 and i.p#>>'{website_probe,prefix_sha256}'~'^[a-f0-9]{64}$'
 and (i.p#>>'{website_probe,bytes_read}')::integer>2000
 and regexp_replace(public.extract_website_domain(i.p#>>'{website_probe,url}'),'^www\.','')
   =regexp_replace(public.extract_website_domain(i.p->>'website'),'^www\.','')
 and public.event_quality_url_is_safe(i.p->>'website') and public.platform_website_class(i.p->>'website') is null
 and public.extract_website_domain(i.p->>'website') is not null
 and jsonb_array_length(i.p#>'{place,websites}')=1 and i.p->>'website'=i.p#>>'{place,websites,0}'
 and i.p#>>'{place,id}'~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 and i.p#>>'{place,operating_status}'='open' and (i.p#>>'{place,confidence}')::numeric>=.9
 and jsonb_array_length(i.p#>'{place,sources}')>0
 and not exists(select 1 from jsonb_array_elements(i.p#>'{place,sources}') s
  where coalesce(s->>'license','')not in('CDLA-Permissive-2.0','Apache-2.0','CC0-1.0'))
 and not exists(select 1 from venue_sources s where s.source_slug='overture' and s.source_entity_id=i.p#>>'{place,id}')
 and not exists(select 1 from venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
 and not exists(select 1 from venue_field_provenance f where f.venue_id=v.id and f.field in('website','phone') and f.is_winning)
 and not exists(select 1 from venue_review_queue q where q.venue_id=v.id and q.field in('website','phone') and q.status in('open','rejected'))
 and not exists(select 1 from content_revisions revision where revision.source_table in('venues','organizations')
  and revision.source_id in(v.id,o.id) and revision.actor_kind='human'
  and revision.changed_fields&&array['website','phone','email'])
 and not exists(select 1 from entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id
  and f.dimension in('editorial','media') and f.state in('source_unavailable','not_applicable'))
 order by v.id limit 20 for update of v,o skip locked
 loop
  p:=r.p;
  if not ((p->>'payload_text')::jsonb @> jsonb_build_array(p->'place')) then continue;end if;
  with places as(select value place from jsonb_array_elements((p->>'payload_text')::jsonb)),normalized as(
   select place,
    btrim(regexp_replace(lower(extensions.unaccent(place#>>'{names,primary}')),'[^[:alnum:]]+',' ','g')) source_name,
    btrim(regexp_replace(lower(extensions.unaccent(p->>'name')),'[^[:alnum:]]+',' ','g')) native_name,
    btrim(regexp_replace(lower(extensions.unaccent(r.city_name)),'[^[:alnum:]]+',' ','g')) city
   from places where pg_input_is_valid(place->>'latitude','double precision')
    and pg_input_is_valid(place->>'longitude','double precision')
    and exists(select 1 from jsonb_array_elements(place->'addresses') a where a->>'country'=r.country_code)
  ) select case when count(*)=1 and bool_and(n.place=p->'place') then 1 else 0 end into names_match from normalized n
  where length(source_name)>=5 and (source_name=native_name or native_name=source_name||' '||city)
   and (n.place->>'latitude')::double precision between -90 and 90 and (n.place->>'longitude')::double precision between -180 and 180
   and public.haversine_m((p->>'latitude')::numeric,(p->>'longitude')::numeric,
    (n.place->>'latitude')::numeric,(n.place->>'longitude')::numeric)<=case when nullif(btrim(p->>'address'),'')is null then 30 else 60 end
   and (nullif(btrim(p->>'address'),'')is null or exists(
    select 1 from jsonb_array_elements(n.place->'addresses') a
    cross join lateral(select btrim(regexp_replace(lower(extensions.unaccent(a->>'freeform')),'[^[:alnum:]]+',' ','g')) source_address,
     btrim(regexp_replace(lower(extensions.unaccent(p->>'address')),'[^[:alnum:]]+',' ','g')) native_address) normalized_address
    where a->>'country'=r.country_code and length(source_address)>=5
     and (position(' '||source_address||' ' in ' '||native_address||' ')>0 or position(' '||native_address||' ' in ' '||source_address||' ')>0)));
  if names_match<>1 then continue;end if;
  if dry_run then changed:=changed+1;continue;end if;
  capture:=jsonb_build_object('raw',p->'place','normalized',jsonb_build_object('name',p#>>'{place,names,primary}',
   'contacts',jsonb_build_object('website',p->>'website')),
   'capture',p-'place','contract','overture_contact_capture:v1');
  insert into venue_sources(venue_id,source_slug,source_entity_id,source_url,payload,payload_hash,last_seen_at,is_primary)
   values((p->>'venue_id')::uuid,'overture',p#>>'{place,id}',p->>'source_url',capture,
    encode(extensions.digest(capture::text,'sha256'),'hex'),(p->>'observed_at')::timestamptz,false) returning id into source_id;
  update venues set website=p->>'website',updated_at=now() where id=(p->>'venue_id')::uuid;
  insert into venue_field_provenance(venue_id,field,source,value,confidence,is_winning,observed_at)
   values((p->>'venue_id')::uuid,'website','overture',to_jsonb(p->>'website'),.8,true,(p->>'observed_at')::timestamptz);
  insert into venue_quality_signals(venue_id,signal_type,value,source,details)
   values((p->>'venue_id')::uuid,'enrichment',1,'overture-contact-evidence',jsonb_build_object(
    'source_id',source_id,'source_url',p->>'source_url','release',p->>'release','payload_sha256',p->>'payload_sha256','human_reviewed',false));
  select to_jsonb(v)into after_row from venues v where id=(p->>'venue_id')::uuid;
  if after_row-array['website','website_domain','updated_at'] is distinct from r.old_venue-array['website','website_domain','updated_at']
   then raise exception 'Unexpected venue mutation %',p->>'venue_id';end if;
  select to_jsonb(o)into after_row from organizations o where id=(p->>'organization_id')::uuid;
  if after_row is distinct from r.old_organization then raise exception 'Unexpected direct business mutation';end if;
  changed:=changed+1;
 end loop;
 perform set_config('matching.overture_result',jsonb_build_object('dry_run',dry_run,'venues',changed)::text,false);
end $repair$;
select current_setting('matching.overture_result')::jsonb result;
commit;
