-- release_gate_checks(): add city_safety_gate_drift (critical) + city_country_mismatch (high).
--
-- WHY
--
-- `cities.country_id` is an input to `location_is_high_risk()`, which is what
-- computes the denormalized `safety_gated` flag on venues / events / hotels /
-- organizations / guides. That flag is the enforcement surface: RLS and the
-- search mirror both read it, not the predicate. NOTHING on the `cities` table
-- repropagates a country change to the attached content -- the per-entity
-- triggers are scoped to that entity's own `country_id` / `city_id` columns, so
-- moving a city between countries leaves every attached row carrying a
-- `safety_gated` value computed from the OLD country, indefinitely.
--
-- Near-miss, 2026-08-03: a repair implementation used
--   UPDATE <table> SET city_id = city_id
-- to "touch" the rows and fire the column-scoped triggers. It does fire them,
-- and it changes nothing, because `derive_entity_geo_address()` guards on
--   new.city_id IS DISTINCT FROM old.city_id
-- -- a VALUE test, not a "was this column named in the UPDATE" test. The derive
-- short-circuits, and `safety_gated` is then recomputed from the STALE country.
-- Measured: moving a 3-venue city into the UAE moved venues_gated 0 -> 0.
-- The repair reported success while gating exactly zero rows.
--
-- Gate A (`city_safety_gate_drift`) compares the stored flag against a live
-- evaluation of the predicate on all five tables, so that class of silent
-- no-op repair cannot ship. It is CRITICAL because the failure mode is content
-- in a criminalizing country remaining publicly visible to anonymous users --
-- an outing risk for the people in it, not a cosmetic data bug. Guides call the
-- predicate with a NULL country (the table has no `country_id`; it resolves
-- through the city). Venues exclude soft-merged duplicates.
--
-- Gate B (`city_country_mismatch`) is the upstream cause rather than the
-- symptom: cities whose assigned country is in doubt, and which therefore
-- feed a doubtful `location_is_high_risk()` result into every entity attached
-- to them. Severity 'high' = warning; it must NOT block CI, because the
-- correct resolution is a human geo decision per city, not a release stop.
--
-- Gate B reports what the REPAIR PATH could not settle. It does not re-derive
-- a verdict of its own. Two earlier implementations did re-derive one, from
-- country centroids, and both failed -- in opposite directions:
--
-- (1) Single-sided ("> 2500 km from its own country's centroid") pushed the
-- noise floor to ~60%. Honolulu, Anchorage, Guam, Saipan, San Juan, Montreal,
-- Quebec City, Moscow, Reunion and Miquelon are all correctly assigned; they
-- are simply far from a large or dispersed country's centroid. A gate whose
-- majority output is correct data teaches reviewers to ignore it.
--
-- (2) Two-sided (also require a DIFFERENT country nearer than 600 km) fixed
-- the noise but bought it with a FALSE NEGATIVE, which is strictly worse.
-- Novosibirsk assigned to Germany was missed: the nearest OTHER country to
-- Novosibirsk is 1,352 km away, so the second side vetoed a real error. There
-- is no threshold pair that separates Honolulu from Sendai without also
-- silencing Novosibirsk -- distance-to-a-centroid is simply not the quantity
-- that decides whether a city is in a country.
--
-- The verdict already exists and was produced from evidence, not geometry.
-- `scripts/data-quality/repair-city-countries.mjs` reverse-geocodes every
-- candidate through Photon and records what came back in
-- `cities.enrichment_status -> 'country_repair' ->> 'state'`:
--   'verified'                    geocoder confirmed the assigned country
--   'resolved'                    the country was corrected
--   'proposed'                    conflict found, city has content, needs a human
--   'blocked_coord_name_conflict' the coordinates themselves look wrong
--   'data_unavailable'            geocoder could not resolve it
-- The first two are settled. The last three are open questions about a
-- country assignment, and those are exactly what this gate counts.
--
-- Properties that follow from sourcing the gate this way: it is a jsonb path
-- test with no distance math and no lateral, so it is essentially free; every
-- row it reports was adjudicated by a geocoder rather than by a heuristic, so
-- there is no noise floor to argue about; it falls to 0 when the review queue
-- is drained; and it rises again by itself whenever a later repair pass finds
-- something new. `detail` carries the full `country_repair` object per city so
-- a reviewer reads the recorded evidence instead of re-deriving it, plus a
-- `by_state` tally so the three open states can be told apart at a glance.
--
-- NOTE: until the repair script has been run with --apply, no city carries a
-- `country_repair` state at all and this gate correctly reports 0.

CREATE OR REPLACE FUNCTION public.release_gate_checks()
 RETURNS TABLE(gate text, severity text, failures bigint, detail jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'hotline_unverified'::text, 'critical'::text,
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and coalesce((h->>'needs_review')::boolean, false) = false
    and (
      nullif(h->>'verified_at', '') is null
      or (h->>'verified_at')::date < (now() - interval '90 days')::date
    )
  union all
  select 'person_outing_guard', 'critical',
    count(*)::bigint, '{}'::jsonb
  from public.personalities p
  where p.duplicate_of_id is null
    and p.is_living
    and (p.visibility = 'public' or p.seo_indexable)
    and p.lgbti_connection in ('community_member', 'ally', 'activist', 'representation')
    and not (coalesce(p.wikidata_qid, '') ~ '^Q[0-9]+$')
    and not exists (
      select 1 from public.personality_sources s
      where s.personality_id = p.id and coalesce(s.source_entity_id, '') !~ '^SKIP_'
    )
  union all
  select 'person_nonperson_public', 'critical',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(p.id), '[]'::jsonb))
  from public.personalities p
  where p.visibility = 'public'
    and p.duplicate_of_id is null
    and p.enrichment_status->'personhood'->>'verdict' = 'non_person'
  union all
  select 'crim_consistency', 'critical',
    count(*)::bigint,
    jsonb_build_object('country_ids', coalesce(jsonb_agg(c.id), '[]'::jsonb))
  from public.countries c
  where (c.lgbti_criminalization->>'legal') = 'false'
    and c.equality_score >= 50
  union all
  select 'dup_integrity', 'critical',
    sum(cnt)::bigint, jsonb_object_agg(tbl, cnt)
  from (
    select 'venues' tbl, count(*) cnt from public.venues t
      left join public.venues d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
    union all
    select 'events', count(*) from public.events t
      left join public.events d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
    union all
    select 'personalities', count(*) from public.personalities t
      left join public.personalities d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
    union all
    select 'news_articles', count(*) from public.news_articles t
      left join public.news_articles d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
  ) dups
  union all
  -- Stored `safety_gated` vs a live evaluation of `location_is_high_risk()`.
  -- Any nonzero value means content is gated (or ungated) on a country that is
  -- no longer the one its city points at. See the header for the UPDATE-no-op
  -- failure this exists to catch.
  select 'city_safety_gate_drift', 'critical',
    sum(cnt)::bigint, jsonb_object_agg(tbl, cnt)
  from (
    select 'venues' tbl, count(*) cnt from public.venues t
      where t.duplicate_of_id is null
        and coalesce(t.safety_gated, false)
            is distinct from public.location_is_high_risk(t.country_id, t.city_id)
    union all
    select 'events', count(*) from public.events t
      where coalesce(t.safety_gated, false)
            is distinct from public.location_is_high_risk(t.country_id, t.city_id)
    union all
    select 'hotels', count(*) from public.hotels t
      where coalesce(t.safety_gated, false)
            is distinct from public.location_is_high_risk(t.country_id, t.city_id)
    union all
    select 'organizations', count(*) from public.organizations t
      where coalesce(t.safety_gated, false)
            is distinct from public.location_is_high_risk(t.country_id, t.city_id)
    union all
    -- guides have no country_id column; the predicate resolves via the city.
    select 'guides', count(*) from public.guides t
      where coalesce(t.safety_gated, false)
            is distinct from public.location_is_high_risk(null::uuid, t.city_id)
  ) gate_drift
  union all
  select 'hotline_reachable', 'high',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and coalesce(h->>'kind', 'hotline') <> 'directory'
    and nullif(h->>'phone', '') is null
    and coalesce(jsonb_array_length(h->'channels'), 0) = 0
  union all
  select 'hotline_url_live', 'high',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and (h->>'link_status') = 'broken'
  union all
  select 'venue_closed_seo', 'high',
    count(*)::bigint, '{}'::jsonb
  from public.venues v
  where v.closed_at is not null and v.seo_indexable is true
  union all
  select 'venue_url_freshness', 'high',
    count(*)::bigint,
    jsonb_build_object('with_website',
      (select count(*) from public.venues where duplicate_of_id is null and nullif(website, '') is not null))
  from public.venues v
  where v.duplicate_of_id is null
    and nullif(v.website, '') is not null
    and (v.url_checked_at is null or v.url_checked_at < now() - interval '90 days')
  union all
  -- Recently-published articles still on the 'general' sentinel. This is the
  -- gate that would have fired in 2026-06 when the previous classifier stopped.
  select 'news_category_coverage', 'high',
    count(*)::bigint,
    jsonb_build_object('window', '30 days')
  from public.news_articles n
  where n.duplicate_of_id is null
    and n.published_at > now() - interval '30 days'
    and coalesce(n.category_canonical, 'general') = 'general'
  union all
  -- The classifier itself stopped running. Catches the failure mode directly
  -- rather than waiting for the backlog above to become visible.
  select 'news_category_classifier_stale', 'high',
    count(*)::bigint,
    jsonb_build_object('last_run_at', max(a.last_run_at))
  from public.admin_automations a
  where a.slug = 'news_category_backfill'
    and (a.last_run_at is null or a.last_run_at < now() - interval '3 days')
  union all
  -- Cities whose country assignment the evidence-based repair path could not
  -- settle. Not a heuristic: every state counted here was written by
  -- `repair-city-countries.mjs` after a Photon reverse-geocode. 'verified' and
  -- 'resolved' are settled and excluded. Warning only -- resolving one is a
  -- per-city human geo decision, so this must never block a release.
  select 'city_country_mismatch', 'high',
    coalesce(sum(s.n), 0)::bigint,
    jsonb_build_object(
      'by_state', coalesce(jsonb_object_agg(s.state, s.n)
                           filter (where s.state is not null), '{}'::jsonb),
      'cities', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'state', c.enrichment_status #>> '{country_repair,state}',
          'country_repair', c.enrichment_status #> '{country_repair}'
        ) order by c.name)
        from public.cities c
        where c.duplicate_of_id is null
          and c.enrichment_status #>> '{country_repair,state}'
              in ('proposed', 'blocked_coord_name_conflict', 'data_unavailable')
      ), '[]'::jsonb))
  from (
    select c.enrichment_status #>> '{country_repair,state}' as state,
           count(*) as n
    from public.cities c
    where c.duplicate_of_id is null
      and c.enrichment_status #>> '{country_repair,state}'
          in ('proposed', 'blocked_coord_name_conflict', 'data_unavailable')
    group by 1
  ) s;
$function$;
