-- Repair venues linked to a same-name city far from their own coordinates.
--
-- MEASURED 2026-10-07: 1,410 live venues sit more than 100 km from their
-- linked city while another city lies within 25 km of their coordinates —
-- 701 from the existing corpus and 709 from the 2026-10-05 gays-cruising
-- import, 510 of them in the WRONG COUNTRY. The producer was
-- commit_venue_staging_item's population-ordered, cross-country name
-- fallback, sealed by 99991791356737. A hand-read sample showed the
-- COORDINATES right and the CITY wrong in essentially every case:
-- "Parc Jules Descampe, Waterloo" (Belgium) on Waterloo, USA; "Travelodge
-- Newcastle Central" on Newcastle, Australia; "Double Play, 439 Dauphine
-- Street" (New Orleans) on Spring Valley, USA.
--
-- WHY MOSTLY DETACH, NOT RELINK. "Relink to the nearest city" was measured
-- and REJECTED: `cities` has no column marking a district or a placeholder,
-- so the nearest row is often a barrio (Balvanera for a Recoleta, Buenos
-- Aires venue), an uncorroborated `tmp-` shell (Alexandra Hills), or simply
-- the wrong town because the right one cannot be represented — `cities`
-- holds one row per (name, country), so Smith College in Northampton,
-- MASSACHUSETTS has no row to move to and "nearest" would say Amherst. So:
--
--   A. RELINK only where a second, independent signal corroborates the new
--      city: the venue's own `city` text names exactly ONE live, non-`tmp-`
--      city within 25 km of its coordinates. Measured: 25 rows.
--   B. Otherwise DETACH: city_id := NULL. A NULL city is recoverable — the
--      `reverse` mode of backfill-venue-cities resolves a venue's city FROM
--      ITS COORDINATES — while a namesake turns into a wrong country, state
--      and safety gate through trg_venues_geo_derive and hides real
--      duplicates from the dedup sweep, which blocks on city.
--      Where every live, non-`tmp-` city within 25 km agrees on ONE country,
--      country_id is corrected to it; otherwise the country is left alone and
--      needs_attention is raised.
--   In both arms `state` is cleared only when it equals the old city's
--   region_name, i.e. only when it was derived from the wrong city — the
--   gays-cruising rows carry the source's own region ("Brabant Wallon"),
--   which is right and is kept.
--
-- EXCLUDED: venues whose coordinates are byte-identical to some city's
-- centroid (42 measured). Those coordinates are a geocoder fallback, not a
-- measurement, so they are not evidence against the linked city.
--
-- RULE-BASED, NOT A FROZEN ID LIST: the set is derived at apply time, so a
-- row a concurrent session already repaired simply no longer matches. Every
-- write is additionally guarded on the venue still pointing at the city the
-- rule read.
--
-- REVERSIBLE: every touched row is stamped
-- enrichment_status.city_namesake_repair with the old city_id, its name,
-- the distance, the old country_id and state, and the action taken, and
-- content_revisions records the full before/after.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:99991791358024_venue_city_namesake_repair', true);

create temp table _vcr on commit drop as
with v as (
  select v.id, v.city, v.state, v.country_id,
         v.latitude lat, v.longitude lng,
         v.city_id, c.name city_name, c.region_name city_region,
         public.haversine_m(v.latitude, v.longitude, c.latitude, c.longitude) / 1000 km
    from public.venues v
    join public.cities c on c.id = v.city_id
   where v.duplicate_of_id is null
     and v.closed_at is null
     and coalesce(v.review_status, '') <> 'archived'
     and v.latitude is not null and v.longitude is not null
     and c.latitude is not null and c.longitude is not null
),
bad as (
  select b.*
    from v b
   where b.km > 100
     -- coordinates that are some city's centroid are a fallback, not evidence
     and not exists (select 1 from public.cities c2
                      where c2.duplicate_of_id is null
                        and c2.latitude = b.lat and c2.longitude = b.lng)
     -- another city lies within 25 km of the venue's own coordinates
     and exists (select 1 from public.cities c
                  where c.duplicate_of_id is null
                    and c.id <> b.city_id
                    and c.latitude between b.lat - 0.3 and b.lat + 0.3
                    and c.longitude between b.lng - 0.5 and b.lng + 0.5
                    and public.haversine_m(b.lat, b.lng, c.latitude, c.longitude) <= 25000)
),
cand as (
  select b.id, c.id cid, c.name, c.country_id ccc
    from bad b
    join public.cities c
      on c.duplicate_of_id is null
     and (c.slug is null or c.slug not like 'tmp-%')
     and c.latitude between b.lat - 0.3 and b.lat + 0.3
     and c.longitude between b.lng - 0.5 and b.lng + 0.5
     and public.haversine_m(b.lat, b.lng, c.latitude, c.longitude) <= 25000
),
agg as (
  select b.id,
         count(c.cid) filter (where lower(c.name) = lower(btrim(b.city))
                                 or public.city_name_key(c.name) = public.city_name_key(b.city)) n_name,
         (array_agg(c.cid) filter (where lower(c.name) = lower(btrim(b.city))
                                      or public.city_name_key(c.name) = public.city_name_key(b.city)))[1] name_cid,
         count(distinct c.ccc) n_countries,
         min(c.ccc::text)::uuid one_country
    from bad b
    left join cand c on c.id = b.id
   group by b.id
)
select b.id, b.city_id old_city_id, b.city_name old_city_name, b.city_region old_region,
       round(b.km::numeric, 1) km, b.country_id old_country_id, b.state old_state,
       case when a.n_name = 1 then 'relink' else 'detach' end action,
       case when a.n_name = 1 then a.name_cid end new_city_id,
       case when a.n_countries = 1 then a.one_country end new_country_id
  from bad b
  join agg a on a.id = b.id;

-- A. Relink, corroborated by the venue's own city text.
update public.venues v
   set city_id = r.new_city_id,
       state = case when v.state is not distinct from r.old_region then null else v.state end,
       enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('city_namesake_repair', jsonb_build_object(
              'action', 'relink',
              'from_city_id', r.old_city_id, 'from_city', r.old_city_name, 'km', r.km,
              'from_country_id', r.old_country_id, 'from_state', r.old_state,
              'by', 'migration:99991791358024', 'at', now())),
       updated_at = now()
  from _vcr r
 where v.id = r.id
   and r.action = 'relink'
   and v.city_id = r.old_city_id;

-- B. Detach; correct the country where the surrounding cities agree on one.
update public.venues v
   set city_id = null,
       country_id = coalesce(r.new_country_id, v.country_id),
       country = coalesce((select co.code from public.countries co where co.id = r.new_country_id), v.country),
       state = case when v.state is not distinct from r.old_region then null else v.state end,
       needs_attention = case when r.new_country_id is null then true else v.needs_attention end,
       enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('city_namesake_repair', jsonb_build_object(
              'action', 'detach',
              'from_city_id', r.old_city_id, 'from_city', r.old_city_name, 'km', r.km,
              'from_country_id', r.old_country_id, 'from_state', r.old_state,
              'country_corrected', r.new_country_id is not null and r.new_country_id is distinct from r.old_country_id,
              'by', 'migration:99991791358024', 'at', now())),
       updated_at = now()
  from _vcr r
 where v.id = r.id
   and r.action = 'detach'
   and v.city_id = r.old_city_id;

do $verify$
declare
  v_set      int;
  v_relink   int;
  v_detach   int;
  v_bad      int;
begin
  select count(*), count(*) filter (where action = 'relink'), count(*) filter (where action = 'detach')
    into v_set, v_relink, v_detach from _vcr;
  raise notice 'venue city namesake repair: % rows (% relink, % detach)', v_set, v_relink, v_detach;

  -- P1: the defect is gone — no repair-set venue still points at its old city.
  select count(*) into v_bad
    from _vcr r join public.venues v on v.id = r.id
   where v.city_id = r.old_city_id;
  if v_bad <> 0 then
    raise exception 'P1 failed: % venue(s) still on the far namesake city', v_bad;
  end if;

  -- P2: every relinked venue sits within 25 km of its new city.
  select count(*) into v_bad
    from _vcr r
    join public.venues v on v.id = r.id
    join public.cities c on c.id = v.city_id
   where r.action = 'relink'
     and public.haversine_m(v.latitude, v.longitude, c.latitude, c.longitude) > 25000;
  if v_bad <> 0 then
    raise exception 'P2 failed: % relinked venue(s) are more than 25 km from their new city', v_bad;
  end if;

  -- P3: every touched venue carries the reversible stamp.
  select count(*) into v_bad
    from _vcr r join public.venues v on v.id = r.id
   where v.city_id is distinct from r.old_city_id
     and not (v.enrichment_status ? 'city_namesake_repair');
  if v_bad <> 0 then
    raise exception 'P3 failed: % repaired venue(s) carry no city_namesake_repair stamp', v_bad;
  end if;

  -- P4: safety — no repaired venue in a high-risk location is publicly visible.
  select count(*) into v_bad
    from _vcr r join public.venues v on v.id = r.id
   where public.location_is_high_risk(v.country_id, v.city_id)
     and not v.safety_gated;
  if v_bad <> 0 then
    raise exception 'P4 failed: % repaired venue(s) sit in a high-risk location but are not safety_gated', v_bad;
  end if;
end
$verify$;
