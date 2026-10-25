-- Default dry run. Internal registration of complete public source captures.
-- The native business producer owns reassessment; no issue is waived here.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
set local app.actor='system:overture-phone-evidence:v1';
do $repair$
#variable_conflict use_column
declare dry_run boolean:=coalesce(nullif(current_setting('matching.overture_dry_run',true),''),'true')::boolean;r record;p jsonb;capture jsonb;source_id uuid;phone_result jsonb;phone_value text;
 after_row jsonb;names_match integer;changed integer:=0;changed_ids uuid[]:='{}';input jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='99991792955040')then raise exception 'Bound contact validation release missing';end if;
 if not pg_try_advisory_xact_lock(hashtext('business_quality_lifecycle'))then raise exception 'Native business producer busy';end if;
 input:=coalesce(nullif(current_setting('matching.overture_proofs',true),''),'[]')::jsonb;
 if jsonb_typeof(input)<>'array' or jsonb_array_length(input)>20 then raise exception 'At most twenty source proofs required';end if;
 for r in
 with inputs as materialized(select value p from jsonb_array_elements(input)),
 unique_ids as(select p->>'venue_id' id from inputs group by 1 having count(*)=1)
 select i.p,to_jsonb(v) old_venue,to_jsonb(o) old_organization,public.organization_facts_only_source(o.id)old_source_contract,ci.name city_name,c.code country_code
 from inputs i join unique_ids u on u.id=i.p->>'venue_id'
 join venues v on v.id=(i.p->>'venue_id')::uuid
 join organizations o on o.id=v.organization_id and o.primary_venue_id=v.id
 join countries c on c.id=v.country_id join cities ci on ci.id=v.city_id and ci.country_id=c.id
 where v.duplicate_of_id is null and v.closed_at is null and o.duplicate_of_id is null and o.status='active'
 and o.roles=array['venue']::text[] and o.claim_status='unclaimed' and o.last_verified_at is null
 and coalesce(to_jsonb(o)->>'claimed_by','')=''
 and coalesce(to_jsonb(v)->>'verified','false')='false'
 and coalesce(to_jsonb(v)->>'verification_status','')not in('verified','claimed')
 and o.field_provenance#>>'{identity,source}'='unified_location'
 and lower(btrim(o.name))=lower(btrim(v.name)) and o.city_id=v.city_id and o.country_id=v.country_id
 and v.website is null and v.phone is null and v.phone_e164 is null and v.email is null
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
 and i.p->>'contact_kind'='phone'
 and jsonb_typeof(i.p#>'{place,phones}')='array'and jsonb_array_length(i.p#>'{place,phones}')between 1 and 10
 and i.p->>'phone'~'^[+()0-9[:space:]./-]{7,64}$'
 and length(regexp_replace(i.p->>'phone','[^0-9]','','g'))between 7 and 15
 and not exists(select 1 from jsonb_array_elements(i.p#>'{place,phones}')phone(value)
  where jsonb_typeof(value)<>'string'or regexp_replace(value#>>'{}','[^+0-9]','','g')
   is distinct from regexp_replace(i.p->>'phone','[^+0-9]','','g'))
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
 and not exists(select 1 from entity_quality_findings f where f.entity_type='organization'and f.entity_id=o.id
  and f.dimension='contact'and(f.waived_at is not null or f.waived_by is not null))
 and(not exists(select 1 from entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id
  and f.dimension in('editorial','media') and f.state in('source_unavailable','not_applicable'))
  or(exists(select 1 from supabase_migrations.schema_migrations where version='99991792951000')
   and public.organization_facts_only_source(o.id)is not null))
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
  phone_result:=public.canonicalize_phone(p->>'phone',r.country_code);
  if phone_result->>'verdict'is distinct from 'ok'or phone_result->>'e164'!~'^\+[1-9][0-9]{6,14}$'then continue;end if;
  phone_value:=phone_result->>'e164';
  if dry_run then changed:=changed+1;continue;end if;
  capture:=jsonb_build_object('raw',p->'place','normalized',jsonb_build_object('name',p#>>'{place,names,primary}',
   'contacts',jsonb_build_object('phone',phone_value)),
   'capture',p-'place','contract','overture_phone_capture:v1');
  insert into venue_sources(venue_id,source_slug,source_entity_id,source_url,payload,payload_hash,last_seen_at,is_primary)
   values((p->>'venue_id')::uuid,'overture',p#>>'{place,id}',p->>'source_url',capture,
    encode(extensions.digest(capture::text,'sha256'),'hex'),(p->>'observed_at')::timestamptz,false) returning id into source_id;
  update venues set phone=phone_value,phone_e164=phone_value,updated_at=now() where id=(p->>'venue_id')::uuid;
  insert into venue_field_provenance(venue_id,field,source,value,confidence,is_winning,observed_at)
   values((p->>'venue_id')::uuid,'phone','overture',to_jsonb(phone_value),.8,true,(p->>'observed_at')::timestamptz);
  insert into venue_quality_signals(venue_id,signal_type,value,source,details)
   values((p->>'venue_id')::uuid,'enrichment',1,'overture-phone-evidence',jsonb_build_object(
    'source_id',source_id,'source_url',p->>'source_url','release',p->>'release','payload_sha256',p->>'payload_sha256','human_reviewed',false));
  select to_jsonb(v)into after_row from venues v where id=(p->>'venue_id')::uuid;
  if after_row-array['phone','phone_e164','updated_at'] is distinct from r.old_venue-array['phone','phone_e164','updated_at']
   then raise exception 'Unexpected venue mutation %',p->>'venue_id';end if;
  update organizations set phone=phone_value,quality_checked_at=null,updated_at=now(),
   field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object('phone',jsonb_build_object(
    'source','overture_phone_capture','source_id',source_id,'source_url',p->>'source_url',
    'observed_at',p->>'observed_at','payload_sha256',p->>'payload_sha256','human_reviewed',false))
   where id=(p->>'organization_id')::uuid;
  select to_jsonb(o)into after_row from organizations o where id=(p->>'organization_id')::uuid;
  if after_row-array['phone','quality_checked_at','updated_at','field_provenance']
   is distinct from r.old_organization-array['phone','quality_checked_at','updated_at','field_provenance']
   or (after_row->'field_provenance')-'phone'is distinct from r.old_organization->'field_provenance'
   then raise exception 'Unexpected direct business mutation';end if;
  if r.old_source_contract is not null and (public.organization_facts_only_source((r.old_organization->>'id')::uuid)->'unavailable_dimensions')is distinct from(r.old_source_contract->'unavailable_dimensions')then raise exception 'Phone source reopened unrelated quality work';end if;
  changed:=changed+1;changed_ids:=array_append(changed_ids,(p->>'venue_id')::uuid);
 end loop;
 perform set_config('matching.overture_phone_result',jsonb_build_object('dry_run',dry_run,'venues',changed,'venue_ids',changed_ids)::text,false);
end $repair$;
select current_setting('matching.overture_phone_result')::jsonb result;
commit;
