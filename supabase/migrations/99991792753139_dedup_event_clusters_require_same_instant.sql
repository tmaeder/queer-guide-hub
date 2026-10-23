-- The "exact duplicates" cluster finder offered every recurring event series as a
-- single mergeable duplicate cluster, and merging a cluster DELETES dates.
--
-- CLAUDE.md states the governing rule for the events feed: recurring-series repeats
-- "are NOT duplicates -- each date carries its own description and ticket URL -- so
-- they are grouped, never merged". Grouping is run_event_series_recompute writing
-- events.series_key/series_size/series_next; search_events then shows one card per
-- series and hides the rest behind "+N more dates". A MERGE instead sets
-- duplicate_of_id, which removes the row from the feed and 301s its slug to the keep
-- row, so merging a series destroys dates a reader could otherwise reach.
--
-- WHAT WAS WRONG (measured on prod, 2026-10-22)
--   _find_duplicate_clusters_body('event') clustered on
--   (lower(unaccent(btrim(title))), city) alone. The body contained the string
--   'start_date' ZERO times and 'series' ZERO times -- it had no date term and never
--   consulted series_key -- so a weekly event at one venue in one city was, by
--   construction, exactly one cluster with one member per date.
--     180 clusters / 580 events / 3,550 member pairs on offer.
--     180 of 180 clusters spanned more than one distinct start_date.
--     13 clusters contained rows carrying a series_key.
--     400 merges if a reviewer clicked through all of them; the largest single
--     cluster held 75 members, i.e. 74 merges on one click.
--   CLAUDE.md called this function "date-aware for events/festivals". That was false
--   of the live function; the line is corrected in the same change as this file.
--
-- THE SWEEP ALREADY REFUSES EVERY ONE OF THESE PAIRS
--   run_dedup_truth_sweep's event branch drops a pair outright when it is a showtime
--   -- same source_slug, different source_entity_id, different start_date. Replaying
--   that veto over the pairs this finder offered: cluster 1 alone contributed 2,775
--   pairs and the veto refuses all 2,775 (2,701 of them sharing a series_key), and
--   across every series-bearing cluster the vetoed count EQUALS the pair count. Of
--   3,550 pairs the page offered with one click, the engine's own veto refuses all
--   but ONE. The engine was never blind here -- only this finder was.
--
-- THE RULE, ANCHORED ON WHAT THE ENGINE ALREADY DECIDED
--   Two event rows may share a cluster only if they share an IDENTICAL start_date,
--   and a row carrying a series_key is not clustered at all.
--
--   Identical instant is what the sweep's own auto arms require: exact_instant_same_city
--   (0.95) needs a.start_date = b.start_date, despace_same_venue_name_exact_ts (0.96)
--   needs it too, and a distinct start_date is precisely what all 50 event pairs a
--   human has ever rejected have in common ("separate showtimes of one production").
--
--   THE SWEEP'S THIRD AUTO ARM IS DELIBERATELY NOT PRESERVED. despace_same_venue_48h
--   (0.97) accepts the same venue_id within +/-48h, which a grouping key cannot express
--   without the anchoring machinery the city branch already demonstrates -- and on this
--   corpus that arm selects RECURRENCES, not duplicates. All three such pairs on offer
--   were measured and read: "I came for you" at Baby Angel Zuerich on Nov 12/13/14
--   (three consecutive nights, all three carrying a series_key), "Sauna/cruising" at
--   Aquari'Hom Liege on Oct 17/18 (sauna opening hours), and
--   "DJ-Workshop & Party fuer Jugendliche" at Nistplatz Zuerich on Oct 24 and 25 (two
--   sessions of one workshop). Not one is a duplicate. Preserving that arm here would
--   have preserved exactly the series this change exists to protect.
--
--   SERIES ROWS ARE EXCLUDED OUTRIGHT, which is stronger than "two rows sharing a
--   non-null series_key never co-cluster". A row the series engine has already placed
--   in a series is a recurrence, so pairing it with anything is the defect; and the
--   weaker form would still cluster a series member against a non-series row.
--
--   MIDNIGHT AND VENUE-CONFLICT PAIRS STAY. The sweep routes both to review rather
--   than auto-merging, and this finder IS a review surface, so under-reaching is the
--   correct error. The one surviving cluster is exactly such a pair, and it is NOT a
--   confirmed duplicate: two "Sauna/cruising" rows in Seville at the same 09:00
--   instant but at two different named venues (Sauna Hispalis, The Cube Urban) -- a
--   venue conflict, which is ambiguous rather than identical. It survives so a human
--   can look at it. A change that returned zero clusters would satisfy "no bad
--   clusters" and is the vacuous pass this repo keeps hitting.
--
-- EVERY OTHER CONTENT TYPE IS BYTE-IDENTICAL. nd is the literal '' on every row when
-- p_content_type <> 'event', so each added predicate reduces to '' = '' and the added
-- group-by column is a constant. Verified against live data: for all 15 other
-- entity_types in search_documents the new body returns a jsonb value EQUAL to the
-- old one, including the two non-empty ones (news 208 clusters, venue 91). Note the
-- city 50 km anchoring branch returns 0 clusters on this corpus and so is compared
-- only on an empty result -- idx_cities_name_country_unique forbids two same-name
-- cities in one country unless region_code differs, which is why it is empty.
--
-- NOT TOUCHED HERE, both measured:
--   * _find_fuzzy_duplicate_clusters_body reads public.venues only and emits pairs of
--     exactly 2, so it has no event exposure.
--   * run_dedup_truth_sweep('event','dry_run') currently reports
--     would_merge 0 / would_queue 0 / skipped 248: the nightly sweep is auto-merging
--     no events at all, so the finder was the live path, as the audit found.

create or replace function public._find_duplicate_clusters_body(p_content_type text, p_limit integer default 100)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with norm as (
    select sd.entity_id, sd.title, sd.city, sd.country, sd.slug,
           lower(unaccent(btrim(coalesce(sd.title, '')))) as nt,
           coalesce(lower(unaccent(btrim(sd.city))), '')  as nc,
           -- cities only: same name in different countries is two places
           case when p_content_type = 'city'
                then coalesce(lower(unaccent(btrim(sd.country))), '')
                else '' end as nco,
           -- events only: same name on two different instants is two occurrences,
           -- not two records of one. A row with no start_date has no occurrence to
           -- be the same as, so it keys on its own id and can never cluster.
           case when p_content_type = 'event'
                then coalesce(sd.start_date::text, sd.entity_id::text)
                else '' end as nd,
           c.region_name, c.latitude as lat, c.longitude as lng
    from public.search_documents sd
    left join public.cities c
      on p_content_type = 'city' and c.id = sd.entity_id
    left join public.events ev
      on p_content_type = 'event' and ev.id = sd.entity_id
    where sd.entity_type = p_content_type
      and sd.title is not null
      and length(btrim(sd.title)) >= 3
      -- a recurring series repeat is grouped by series_key, never merged
      and (p_content_type <> 'event' or ev.series_key is null)
  ),
  -- only names that occur more than once can form a cluster; anchoring the
  -- whole corpus with a correlated scan took ~50 s, this set is a few dozen rows
  cand as (
    select n.*
    from norm n
    join (select nt, nc, nco, nd from norm group by nt, nc, nco, nd having count(*) > 1) k
      using (nt, nc, nco, nd)
  ),
  anchored as (
    -- cities: the first same-name member (by slug) within 50 km anchors the
    -- cluster; unknown points prefer a known anchor but never anchor known points.
    -- other types: one anchor per group, i.e. the old grouping.
    select n.*,
           case when p_content_type <> 'city' then ''
                else (
                  select a.entity_id::text
                  from cand a
                  where a.nt = n.nt and a.nc = n.nc and a.nco = n.nco and a.nd = n.nd
                    and (n.lat is null or n.lng is null
                         or (a.lat is not null and a.lng is not null
                             and public.haversine_m(n.lat, n.lng, a.lat, a.lng) <= 50000))
                  order by (a.lat is null or a.lng is null), a.slug nulls last, a.entity_id
                  limit 1
                ) end as anchor
    from cand n
  ),
  groups as (
    select nt, nc, nco, nd, anchor, count(*) as c,
           jsonb_agg(jsonb_build_object('id', entity_id, 'title', title, 'city', city,
                                        'country', country, 'slug', slug,
                                        'region', region_name,
                                        'has_coords', case when p_content_type = 'city'
                                          then lat is not null and lng is not null else null end)
                     order by slug nulls last) as members
    from anchored
    group by nt, nc, nco, nd, anchor
    having count(*) > 1
      -- Two points can each be within 50 km of an anchor while being 100 km
      -- apart from each other. Do not offer that ambiguous group for merging.
      and (p_content_type <> 'city' or not exists (
        select 1 from anchored a join anchored b
          on a.nt = b.nt and a.nc = b.nc and a.nco = b.nco and a.nd = b.nd
             and a.anchor = b.anchor
        where a.nt = anchored.nt and a.nc = anchored.nc
          and a.nco = anchored.nco and a.nd = anchored.nd and a.anchor = anchored.anchor
          and a.entity_id < b.entity_id
          and a.lat is not null and a.lng is not null
          and b.lat is not null and b.lng is not null
          and public.haversine_m(a.lat, a.lng, b.lat, b.lng) > 50000
      ))
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object('normalized_title', nt, 'city', nullif(nc, ''),
                                        'count', c, 'members', members) order by c desc)
    from (select * from groups order by c desc, nt limit greatest(p_limit, 0)) x
  ), '[]'::jsonb);
$function$;

-- the body stays internal; only the gated wrapper is callable
revoke all on function public._find_duplicate_clusters_body(text, integer) from public, anon, authenticated;

do $verify$
declare
  v jsonb;
  v_spanning int;
  v_series int;
  v_expect int;
  v_actual int;
begin
  v := public._find_duplicate_clusters_body('event', 1000000);

  -- Zero-invariant: no event cluster may span two instants.
  select count(*) into v_spanning
  from jsonb_array_elements(v) g
  where (select count(distinct e.start_date)
         from jsonb_array_elements(g->'members') m
         join public.events e on e.id = (m->>'id')::uuid) > 1;
  if v_spanning <> 0 then
    raise exception 'postcondition: % event cluster(s) span more than one start_date', v_spanning;
  end if;

  -- Zero-invariant: no event cluster may hold a row the series engine has grouped.
  select count(*) into v_series
  from jsonb_array_elements(v) g
  cross join lateral jsonb_array_elements(g->'members') m
  join public.events e on e.id = (m->>'id')::uuid
  where e.series_key is not null;
  if v_series <> 0 then
    raise exception 'postcondition: % event cluster member(s) carry a series_key', v_series;
  end if;

  -- Non-vacuity: the two checks above also pass on an empty result, so the event
  -- output is compared against the RULE restated independently of the body -- the
  -- same predicate expressed without the anchoring, the limit or the json shape.
  -- Equality fails in both directions, so a body that returned '[]' for events
  -- would not slip through while the corpus still holds a same-instant collision.
  select count(*) into v_expect from (
    select 1
    from public.search_documents sd
    left join public.events ev on ev.id = sd.entity_id
    where sd.entity_type = 'event'
      and sd.title is not null
      and length(btrim(sd.title)) >= 3
      and ev.series_key is null
    group by lower(unaccent(btrim(coalesce(sd.title, '')))),
             coalesce(lower(unaccent(btrim(sd.city))), ''),
             coalesce(sd.start_date::text, sd.entity_id::text)
    having count(*) > 1
  ) e;
  v_actual := jsonb_array_length(v);
  if v_actual <> v_expect then
    raise exception 'postcondition: event clusters % <> independently computed %',
      v_actual, v_expect;
  end if;

  raise notice 'event clusters: % (members %, one-click merges %)',
    v_actual,
    (select coalesce(sum(jsonb_array_length(g->'members')), 0) from jsonb_array_elements(v) g),
    (select coalesce(sum(jsonb_array_length(g->'members') - 1), 0) from jsonb_array_elements(v) g);
end
$verify$;
