-- Bounded recovery of facts already registered against the sole primary venue.
-- Set dry_run=false only after inspecting the candidate/field counts.
-- Unknown/AI-only sources, ambiguous values, supplied profile fields, identity or
-- country conflicts and secondary locations are excluded. No source text is
-- rewritten; no verification, safety or publication flag is changed.
with settings as (select true as dry_run), lineage as materialized (
 select o.id,v.id venue_id,s.id source_id,s.source_slug,s.source_url,s.payload_hash,s.last_seen_at,
  s.payload->'normalized' normalized,c.code country_code,o.description,o.website,o.email,o.phone
 from public.organizations o
 join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 join public.venue_sources s on s.venue_id=v.id
 left join public.countries c on c.id=v.country_id
 where o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
  and o.roles=array['venue']::text[] and o.field_provenance#>>'{identity,source}'='unified_location'
  and lower(btrim(o.name))=lower(btrim(v.name))
  and lower(btrim(s.payload#>>'{normalized,name}'))=lower(btrim(v.name))
  and (o.country_id is null or o.country_id=v.country_id)
  and (o.city_id is null or o.city_id=v.city_id)
  and (nullif(btrim(s.payload#>>'{normalized,location,country}'),'') is null
       or upper(btrim(s.payload#>>'{normalized,location,country}'))=upper(c.code)
       or lower(btrim(s.payload#>>'{normalized,location,country}'))=lower(c.name))
  and s.source_slug not in ('unknown','spartacus_gpt') and s.source_entity_id is not null
  and coalesce(s.confidence,0)>=0.92
  and not exists(select 1 from public.venues x where x.organization_id=o.id and x.id<>v.id and x.duplicate_of_id is null)
), raw_facts as (
 select l.*,f.key,btrim(f.value) value from lineage l
 cross join lateral (values
  ('description',case when jsonb_typeof(l.normalized->'description')='string' then l.normalized->>'description' end),
  ('website',case when jsonb_typeof(l.normalized#>'{contacts,website}')='string' then l.normalized#>>'{contacts,website}' end),
  ('email',case when jsonb_typeof(l.normalized#>'{contacts,email}')='string' then l.normalized#>>'{contacts,email}' end),
  ('phone',case when jsonb_typeof(l.normalized#>'{contacts,phone}')='string' then l.normalized#>>'{contacts,phone}' end)
 ) f(key,value)
 where case f.key when 'description' then nullif(btrim(l.description),'') is null
  when 'website' then l.website is null when 'email' then l.email is null when 'phone' then l.phone is null end
), prepared as (
 select r.*,case when key='phone' then public.canonicalize_phone(value,country_code) end phone_verdict
 from raw_facts r
), valid as (
 select *,case key when 'phone' then phone_verdict->>'e164' when 'email' then lower(value) else value end canonical_value
 from prepared where case key
  when 'description' then length(value) between 80 and 20000 and value!~'<[^>]+>'
  when 'website' then value~*'^https?://[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/?#][^[:space:]<>"\\]*)?$'
  when 'email' then value~*'^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' and value!~*'@(example\.|sentry\.|.*wixpress\.)'
  when 'phone' then phone_verdict->>'verdict'='ok' end
), single_values as (
 select id,key,min(canonical_value) value,jsonb_agg(jsonb_build_object('source_id',source_id,'source_slug',source_slug,
  'source_url',source_url,'payload_hash',payload_hash,'last_seen_at',last_seen_at,'venue_id',venue_id,'source_value',value) order by source_id) sources
 from valid group by id,key having count(distinct canonical_value)=1
), candidates as materialized (
 select id,jsonb_object_agg(key,value) patch,jsonb_object_agg(key,jsonb_build_object(
  'source','registered_venue_source_facts','source_table','venue_sources','sources',sources,
  'inherited_at',now(),'human_reviewed',false)) provenance from single_values group by id
), selected as materialized (
 select o.id,c.patch,c.provenance from candidates c join public.organizations o on o.id=c.id
 where not exists(select 1 from jsonb_each_text(c.patch) f where
  case when f.key='description' then nullif(btrim(o.description),'') is not null
   else to_jsonb(o)->>f.key is not null end)
 order by o.id limit 200 for update of o skip locked
), audit as (
 insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
 select 'organization',e.id,case when f.key='description' then 'editorial' else 'contact' end,
  jsonb_build_object(f.key,to_jsonb(o)->f.key),jsonb_build_object(f.key,f.value,'provenance',e.provenance->f.key),
  'registered_venue_source_facts_'||f.key
 from selected e join public.organizations o on o.id=e.id cross join lateral jsonb_each_text(e.patch) f
 where not (select dry_run from settings)
 returning entity_id
), changed as (
 update public.organizations o set description=coalesce(nullif(btrim(o.description),''),e.patch->>'description'),
  website=coalesce(o.website,e.patch->>'website'),email=coalesce(o.email,e.patch->>'email'),phone=coalesce(o.phone,e.patch->>'phone'),
  field_provenance=coalesce(o.field_provenance,'{}'::jsonb)||e.provenance,updated_at=now()
 from selected e where o.id=e.id and exists(select 1 from audit a where a.entity_id=e.id)
 returning o.id,o.description,o.website,o.email,o.phone
), findings as (
 update public.entity_quality_findings f set state='pass',checked_at=now(),
  reason_code=case when f.dimension='editorial' then 'description_usable' else 'contact_available' end,
  evidence=jsonb_build_object('repair_source','registered_venue_source_facts','source_records',s.provenance)
 from changed c join selected s on s.id=c.id where f.entity_type='organization' and f.entity_id=c.id
  and f.state in ('fail','pending') and f.waived_at is null and
  ((f.dimension='editorial' and length(btrim(c.description))>=80)
    or (f.dimension='contact' and coalesce(c.website,c.email,c.phone) is not null)) returning f.id
)
select (select dry_run from settings) dry_run,(select count(*) from candidates) candidate_organizations,
 (select count(*) from selected) selected_organizations,(select count(*) from changed) changed,
 (select count(*) from audit) fields_recovered,(select count(*) from findings) findings_corrected,
 (select jsonb_object_agg(key,n) from(select f.key,count(*) n from selected s cross join lateral jsonb_each(s.patch) f group by f.key) x) selected_fields;
