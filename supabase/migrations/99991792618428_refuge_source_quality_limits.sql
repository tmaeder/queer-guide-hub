-- Restroom source-specific contact/media availability; supplied descriptions remain assessed.
-- Explicit per-dimension contracts for already registered importers.
-- GayOut import-gayout.mjs deliberately excludes editorial descriptions/photos.
-- Planet Randy toNormalizedVenue emits identity/location/contact facts only;
-- source_image_url remains an unlicensed reference, not approved reusable media.
-- Both can supply contacts: do not exhaust contact research for them.
-- Supplied facts, multiple sources/locations and identity conflicts remain excluded.
-- No content, verification, publication or safety state is invented.
create or replace function public.organization_facts_only_source(p_id uuid)
returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'contract',sl.source_slug||':registered-facts:v1','outcome','source_unavailable',
  'unavailable_dimensions',case when sl.source_slug='gays-cruising' then '["editorial","contact","media"]'::jsonb when sl.source_slug='refuge-restrooms' then '["contact","media"]'::jsonb else '["editorial","media"]'::jsonb end,
  'source_table','venues','source_venue_id',v.id,
  'source_records',(select jsonb_agg(jsonb_build_object('id',s.id,'source_slug',s.source_slug,
    'source_entity_id',s.source_entity_id,'source_url',s.source_url,'payload_hash',s.payload_hash) order by s.id)
    from public.venue_sources s where s.venue_id=v.id),
  'explanation',case when sl.source_slug='gays-cruising'
   then 'The sole registered importer supplies identity/location facts and a backlink; no verified business prose, contact or reusable media is supplied.'
   when sl.source_slug='refuge-restrooms' then 'The sole registered restroom importer supplies location, accessibility and available comment/directions text, but no business contacts or media. Editorial assessment remains applicable.'
   else 'The sole registered importer supplies identity/location facts and may supply contact details. Editorial prose and reusable media are excluded from its import contract; contact work remains applicable.' end,
  'human_reviewed',false)
 from public.organizations o join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 cross join lateral (select min(source_slug) source_slug,count(distinct source_slug) source_count
   from public.venue_sources where venue_id=v.id) sl
 where o.id=p_id and o.duplicate_of_id is null and v.duplicate_of_id is null
  and v.closed_at is null and o.roles=array['venue']::text[]
  and sl.source_count=1 and sl.source_slug in ('gays-cruising','gayout','planet-randy','refuge-restrooms')
  and (sl.source_slug<>'gays-cruising' or v.category='cruising')
  and (sl.source_slug<>'refuge-restrooms' or v.category='toilet')
  and o.field_provenance#>>'{identity,source}'='unified_location'
  and lower(btrim(o.name))=lower(btrim(v.name))
  and (o.city_id is null or o.city_id=v.city_id) and (o.country_id is null or o.country_id=v.country_id)
  -- Require the newer importer's actual structured payload and original URL;
  -- a legacy CSV's source label alone is not enough.
  and (sl.source_slug in ('gays-cruising','refuge-restrooms') or not exists(
   select 1 from public.venue_sources s where s.venue_id=v.id and (
    s.payload#>>'{normalized,metadata,data_source}' is distinct from sl.source_slug
    or lower(btrim(s.payload#>>'{normalized,name}')) is distinct from lower(btrim(v.name))
    or s.source_url is null
    or (sl.source_slug='gayout' and s.source_url!~*'^https://(www\.)?gayout\.com/[^[:space:]]+$')
    or (sl.source_slug='planet-randy' and s.source_url!~*'^https://planet-randy\.com/[^[:space:]]+$'))))
  -- Refuge has no source URL in its adapter. Require the registered numeric
  -- API identity to agree across raw and normalized payloads instead.
  and (sl.source_slug<>'refuge-restrooms' or not exists(
   select 1 from public.venue_sources s where s.venue_id=v.id and (
    s.source_entity_id is null or s.source_entity_id!~'^[1-9][0-9]*$'
    or s.payload#>>'{raw,id}' is distinct from s.source_entity_id
    or s.payload#>>'{normalized,sourceId}' is distinct from s.source_entity_id
    or s.payload#>>'{normalized,metadata,external_id}' is distinct from s.source_entity_id
    or s.payload#>>'{normalized,metadata,data_source}' is distinct from 'refuge-restrooms'
    or s.payload#>>'{normalized,sourceName}' is distinct from 'refuge-restrooms'
    or lower(btrim(s.payload#>>'{raw,name}')) is distinct from lower(btrim(v.name))
    or lower(btrim(s.payload#>>'{normalized,name}')) is distinct from lower(btrim(v.name)))))
  -- Supplied extra facts must be enriched, not labelled unavailable, even if
  -- an older producer stored them under this source slug.
  and not exists(select 1 from public.venue_sources s where s.venue_id=v.id and (
    exists(select 1 from (values (s.payload->'raw'),(s.payload->'normalized'),(s.payload->'enriched')) sections(data)
     cross join lateral jsonb_each(case when jsonb_typeof(sections.data)='object' then sections.data else '{}'::jsonb end) fact
     where (fact.key in ('images','image_url','logo_url','cover_image_url')
       or (sl.source_slug='refuge-restrooms' and fact.key='photos')
       or (sl.source_slug<>'refuge-restrooms' and fact.key='description')
       or (sl.source_slug in ('gays-cruising','refuge-restrooms') and fact.key in ('website','email','phone','social','contacts')))
       and fact.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb,'"[]"'::jsonb,'"{}"'::jsonb))
  ))
  and not exists(select 1 from public.venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
$$;
revoke all on function public.organization_facts_only_source(uuid) from public,anon,authenticated;
grant execute on function public.organization_facts_only_source(uuid) to service_role;


