-- release_gate_checks(): make the venues arm of `city_safety_gate_drift`
-- set-based, like its four siblings.
--
-- The check has five arms. Four resolve the high-risk country SET once (the
-- `hr`/`cc` CTEs) and hash-join against it. The venues arm alone called
-- `venue_is_safety_gated(country_id, city_id, category)` — and therefore
-- `location_is_high_risk()` — ONCE PER ROW, 26,905 times. Measured on prod:
--
--     venues arm (per-row)   1,242 ms   480,671 buffers
--     other four arms          164 ms    20,163 buffers
--     dup_integrity             68 ms    18,173 buffers
--     person_outing_guard       32 ms     4,971 buffers
--     whole function     1,875-4,515 ms  564,226 buffers
--
-- So one arm was 86% of the function's buffers. Rewritten to the siblings'
-- shape that arm measures 66 ms / 9,525 buffers — 19x faster, 50x fewer
-- buffers. Whole function, dry-run on prod inside a rolled-back transaction:
--
--     before   1,875 ms   564,226 buffers
--     after      399 ms    85,342 buffers      (4.7x faster, -85% buffers)
--
-- Why this matters beyond tidiness: PostgREST reaches this through
-- `authenticator`, whose statement_timeout is 8s, and `service_role` has no
-- rolconfig of its own so it inherits that ceiling. The CI gate
-- `check-data-quality-gates.mjs` was failing with 57014 at 8.2s. The function
-- is not slow because the database is busy; it is slow enough that any
-- concurrent load pushes it over.
--
-- The predicate is NOT retyped from the function body. `venue_is_safety_gated`
-- is `location_is_high_risk(country_id, city_id) OR category = 'cruising'`, and
-- `location_is_high_risk` resolves the country via the city when `country_id`
-- is null — which is exactly `coalesce(t.country_id, cc.country_id)`. The `hr`
-- CTE already in this function carries a comment saying its predicate is
-- "copied verbatim from the body of location_is_high_risk so the two cannot
-- diverge"; this change puts the venues arm on that same shared definition
-- instead of leaving it as the one caller that re-derives it per row.
--
-- Equivalence is ASSERTED below against live data rather than argued here,
-- because this arm decides whether content in criminalizing countries is
-- gated, and a rewrite that silently changed the answer would un-gate real
-- venues. Note the positive control: "0 disagreements" also holds on an empty
-- set, so the assertion additionally requires a non-trivial number of rows AND
-- a non-zero count of gated venues. Without that, a WHERE clause that
-- accidentally matched nothing would pass this migration.

-- ---------------------------------------------------------------------------
-- 1. Assert the two predicates agree, on every live venue, before replacing.
-- ---------------------------------------------------------------------------
do $equiv$
declare
  v_rows      bigint;
  v_per_row   bigint;
  v_set_based bigint;
  v_disagree  bigint;
begin
  with hr as (
    select cp.place_id as country_id
      from public.geo_country_profiles cp
     where (cp.lgbti_criminalization->>'legal') = 'false'
        or lower(coalesce(cp.lgbti_criminalization->>'death_penalty','')) = 'yes'
  ),
  cc as (
    select gp.id, gp.country_id
      from public.geo_places gp
     where gp.place_type = 'city'
  ),
  v as (
    select
      coalesce(public.venue_is_safety_gated(t.country_id, t.city_id, t.category), false) as per_row,
      coalesce(
        (coalesce(t.country_id, cc.country_id) in (select country_id from hr))
        or coalesce(t.category = 'cruising', false), false) as set_based
      from public.venues t
      left join cc on cc.id = t.city_id
     where t.duplicate_of_id is null
  )
  select count(*),
         count(*) filter (where per_row),
         count(*) filter (where set_based),
         count(*) filter (where per_row is distinct from set_based)
    into v_rows, v_per_row, v_set_based, v_disagree
  from v;

  if v_disagree <> 0 then
    raise exception
      'release_gate_checks venues arm rewrite is NOT equivalent: % of % venues disagree (per_row=%, set_based=%)',
      v_disagree, v_rows, v_per_row, v_set_based;
  end if;

  -- Positive control. Zero disagreements is also what an empty comparison
  -- returns, so refuse to accept the result unless the comparison actually
  -- had something to compare and actually found gated venues.
  if v_rows < 1000 or v_per_row = 0 then
    raise exception
      'equivalence check was vacuous: compared % rows, % gated — expected thousands of rows and a non-zero gated count',
      v_rows, v_per_row;
  end if;

  raise notice 'venues arm equivalence: % rows, % gated both ways, 0 disagreements', v_rows, v_per_row;
end
$equiv$;

-- ---------------------------------------------------------------------------
-- 2. Replace the function. ONLY the venues arm of city_safety_gate_drift
--    changes; every other gate is byte-identical to the prior definition.
-- ---------------------------------------------------------------------------
create or replace function public.release_gate_checks()
returns table(gate text, severity text, failures bigint, detail jsonb)
language sql
stable
security definer
set search_path to 'public'
as $function$
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
    with hr as (
      -- The high-risk country SET, resolved ONCE. Predicate copied verbatim
      -- from the body of location_is_high_risk so the two cannot diverge.
      select cp.place_id as country_id
        from public.geo_country_profiles cp
       where (cp.lgbti_criminalization->>'legal') = 'false'
          or lower(coalesce(cp.lgbti_criminalization->>'death_penalty','')) = 'yes'
    ),
    cc as (
      select gp.id, gp.country_id
        from public.geo_places gp
       where gp.place_type = 'city'
    )
    -- venues resolve through the same `hr`/`cc` sets as every other arm.
    -- `venue_is_safety_gated` is `location_is_high_risk(country_id, city_id)
    -- OR category = 'cruising'`, and location_is_high_risk falls back to the
    -- city's country when country_id is null — hence the coalesce below.
    -- Calling the function per row cost 480,671 of this function's 564,226
    -- buffers; the migration that made this change asserts the two forms agree
    -- on every live venue.
    select 'venues' tbl, count(*) cnt from public.venues t
      left join cc on cc.id = t.city_id
      where t.duplicate_of_id is null
        and coalesce(t.safety_gated, false)
            is distinct from coalesce(
              (coalesce(t.country_id, cc.country_id) in (select country_id from hr))
              or coalesce(t.category = 'cruising', false), false)
    union all
    select 'events', count(*) from public.events t
      left join cc on cc.id = t.city_id
      where coalesce(t.safety_gated, false)
            is distinct from coalesce(coalesce(t.country_id, cc.country_id) in (select country_id from hr), false)
    union all
    select 'hotels', count(*) from public.hotels t
      left join cc on cc.id = t.city_id
      where coalesce(t.safety_gated, false)
            is distinct from coalesce(coalesce(t.country_id, cc.country_id) in (select country_id from hr), false)
    union all
    select 'organizations', count(*) from public.organizations t
      left join cc on cc.id = t.city_id
      where coalesce(t.safety_gated, false)
            is distinct from coalesce(coalesce(t.country_id, cc.country_id) in (select country_id from hr), false)
    union all
    -- guides have no country_id column; the predicate resolves via the city.
    select 'guides', count(*) from public.guides t
      left join cc on cc.id = t.city_id
      where coalesce(t.safety_gated, false)
            is distinct from coalesce(cc.country_id in (select country_id from hr), false)
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
  -- NEW: the age of the link evidence, not its verdict. A 'live' from two
  -- months ago is the state that hid the hijacked mindline-trans domain.
  select 'hotline_link_stale', 'high',
    count(*)::bigint,
    jsonb_build_object(
      'ids', coalesce(jsonb_agg(h->>'id' order by h->>'link_checked_at'), '[]'::jsonb),
      'oldest_checked_at', min(h->>'link_checked_at'),
      'threshold_days', 45)
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and nullif(h->>'url', '') is not null
    and (
      nullif(h->>'link_checked_at', '') is null
      or (h->>'link_checked_at')::date < (now() - interval '45 days')::date
    )
  union all
  -- NEW: an unrecognised `link_status` means some writer is setting a value the
  -- readers ignore. Three rows sat at 'ok' — outside the union — and
  -- `hotline_url_live` silently skipped every one of them.
  select 'hotline_link_status_vocab', 'high',
    count(*)::bigint,
    jsonb_build_object(
      'ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb),
      'values', coalesce(jsonb_agg(distinct h->>'link_status'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and nullif(h->>'link_status', '') is not null
    and (h->>'link_status') not in ('live', 'broken', 'bot_blocked')
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

-- ---------------------------------------------------------------------------
-- 3. End-to-end: the replaced function must still return every gate, and its
--    venues drift count must equal what the per-row form reports right now.
--    Step 1 compares the predicates; this compares the shipped function.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_gates    bigint;
  v_new      bigint;
  v_per_row  bigint;
begin
  select count(*) into v_gates from public.release_gate_checks();
  if v_gates <> 15 then
    raise exception 'release_gate_checks() returned % gates, expected 15', v_gates;
  end if;

  select (detail->>'venues')::bigint into v_new
    from public.release_gate_checks()
   where gate = 'city_safety_gate_drift';

  select count(*) into v_per_row
    from public.venues t
   where t.duplicate_of_id is null
     and coalesce(t.safety_gated, false)
         is distinct from coalesce(public.venue_is_safety_gated(t.country_id, t.city_id, t.category), false);

  if v_new is distinct from v_per_row then
    raise exception
      'city_safety_gate_drift venues count changed: new=% per_row=%', v_new, v_per_row;
  end if;

  raise notice 'release_gate_checks(): 15 gates, venues drift % (unchanged)', v_new;
end
$verify$;
