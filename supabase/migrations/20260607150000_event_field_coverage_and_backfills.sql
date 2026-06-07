-- Event content-quality: measurement function + free structural backfills (P0)
--
-- Context: events are bimodal — text fields strong, structural fields gutted.
-- This migration adds a canonical coverage metric and fills the fields that are
-- cheaply recoverable from already-linked city data (no API/LLM cost):
--   * timezone   <- cities.timezone        (~659 rows)
--   * lat/lng    <- cities centroid         (~294 rows, coarse, overridable)
--   * venue_id   <- exact name+city match   (~132 rows)
--   * end_date   <- start_date for single-instant event types
--
-- All event UPDATEs fire the local search_documents_sync re-index trigger
-- (delete + search_documents_index_events(id), no HTTP) — safe in one txn.

-- 1) Measurement: per-source + overall field fill-rates. Canonical progress metric
--    for every later enrichment phase; later surfaced in the admin quality panel.
create or replace function public.event_field_coverage()
returns table (
  data_source     text,
  total           bigint,
  pct_no_desc     numeric,
  pct_no_end      numeric,
  pct_no_tz       numeric,
  pct_no_venue    numeric,
  pct_no_img      numeric,
  pct_no_geo      numeric,
  pct_no_url      numeric,
  pct_no_target   numeric,
  pct_no_a11y     numeric,
  pct_no_relev    numeric,
  avg_trust       numeric,
  avg_quality     numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    case when grouping(data_source) = 1 then 'ALL'
         else coalesce(data_source, '(none)') end                                              as data_source,
    count(*)                                                                                    as total,
    round(100.0 * count(*) filter (where description is null or length(trim(description)) < 20) / count(*), 1) as pct_no_desc,
    round(100.0 * count(*) filter (where end_date is null) / count(*), 1)                       as pct_no_end,
    round(100.0 * count(*) filter (where timezone is null) / count(*), 1)                       as pct_no_tz,
    round(100.0 * count(*) filter (where venue_id is null) / count(*), 1)                       as pct_no_venue,
    round(100.0 * count(*) filter (where images is null or array_length(images, 1) is null) / count(*), 1) as pct_no_img,
    round(100.0 * count(*) filter (where latitude is null or longitude is null) / count(*), 1)  as pct_no_geo,
    round(100.0 * count(*) filter (where ticket_url is null and website is null) / count(*), 1) as pct_no_url,
    round(100.0 * count(*) filter (where target_groups is null or array_length(target_groups, 1) is null) / count(*), 1) as pct_no_target,
    round(100.0 * count(*) filter (where accessibility_attributes is null or array_length(accessibility_attributes, 1) is null) / count(*), 1) as pct_no_a11y,
    round(100.0 * count(*) filter (where lgbti_relevance_score is null) / count(*), 1)          as pct_no_relev,
    round(avg(trust_score), 1)                                                                  as avg_trust,
    round(avg(quality_score), 1)                                                                as avg_quality
  from public.events
  where duplicate_of_id is null
  group by rollup (data_source)
  order by grouping(data_source) desc, count(*) desc;
$$;

grant execute on function public.event_field_coverage() to authenticated, service_role;

-- 2) Timezone backfill from the linked city.
update public.events e
set timezone = c.timezone
from public.cities c
where e.city_id = c.id
  and e.timezone is null
  and c.timezone is not null
  and length(trim(c.timezone)) > 0;

-- 3) Coarse geo backfill: city centroid for events with a city but no coords.
--    Marked via geo_linked_at so a later precise geocode pass can override.
--    Rows here all have city_id, so trg_event_geocode (fires only when city_id
--    IS NULL) stays quiet; coerce_null_island handles any (0,0) city.
update public.events e
set latitude = c.latitude,
    longitude = c.longitude,
    geo_linked_at = now()
from public.cities c
where e.city_id = c.id
  and (e.latitude is null or e.longitude is null)
  and c.latitude is not null
  and c.longitude is not null
  and not (c.latitude = 0 and c.longitude = 0);

-- 4) Confident venue auto-link: exact name + same city only (no fuzzy, no cross-city).
update public.events e
set venue_id = v.id
from public.venues v
where e.venue_id is null
  and e.venue_name is not null
  and length(trim(e.venue_name)) > 2
  and e.city_id = v.city_id
  and lower(trim(e.venue_name)) = lower(trim(v.name))
  and v.duplicate_of_id is null;

-- 5) Heuristic end_date = start_date for single-instant event types only.
--    Excludes festival/pride/conference/other (genuinely multi-day or ambiguous).
update public.events
set end_date = start_date
where end_date is null
  and start_date is not null
  and lower(event_type) in (
    'party','drag','film','concert','workshop','meetup','social',
    'fetish','sports','art','theater','fair','protest'
  );
