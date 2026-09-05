-- `release_gate_checks()` is timing out again and failing `Critical data-quality
-- gates` on unrelated PRs -- the SAME symptom `20261021110000` fixed, from a
-- DIFFERENT cause. Observed on PR #3400 (a one-line CSS change):
--
--     release_gate_checks -> HTTP 500:
--     {"code":"57014", "message":"canceling statement due to statement timeout"}
--
-- AGAIN, NO GATE IS FAILING. All six `critical` gates read 0. The function does
-- not finish inside PostgREST's 8 s ceiling, so a green corpus reports as a red
-- build and the safety checks do not run at all. At 17:11 UTC one run passed and
-- another failed in the SAME MINUTE -- the signature of a query sitting on its
-- ceiling, not one that broke.
--
-- WHERE THE TIME GOES NOW. Measured per arm with EXPLAIN ANALYZE on prod
-- (end-to-end 3204 ms and 4149 ms on two runs; the arms sum to ~3380 ms, so the
-- accounting is complete):
--
--     venue_url_freshness      1066 ms   <- two seq scans of venues
--     dup_integrity             883 ms   (649 ms of it the venues arm)
--     venue_closed_seo          851 ms   <- one seq scan, returns 0 rows
--     city_safety_gate_drift    320 ms   (20261021110000 is holding)
--     news_category_coverage    220 ms   (index-backed)
--     city_country_mismatch      40 ms
--
-- `venues` (37,967 rows) is scanned END TO END FIVE TIMES per call: the
-- dup_integrity hash, the gate-drift arm, venue_closed_seo, and
-- venue_url_freshness twice. ~190k row reads, ~2.8 s of the ~3.4 s. The previous
-- fix removed per-row FUNCTION CALLS; what is left is raw sequential scans.
--
-- TWO FIXES, EACH VERIFIED SEPARATELY, AND THEY ARE NOT THE SAME KIND.
--
-- 1. venue_closed_seo -> PARTIAL INDEX. The predicate is `closed_at is not null
--    and seo_indexable is true` and it matches ZERO of 37,967 rows, so the whole
--    table is read to return nothing. Verified with hypopg (hypothetical index,
--    no write): the planner moves Seq Scan -> Index Only Scan and the estimate
--    drops 6670.67 -> 2.23. The index is partial on a near-empty predicate, so
--    it costs approximately nothing to store or maintain on a disk-constrained
--    instance -- which is the only reason an index is the right tool here.
--
-- 2. venue_url_freshness -> ONE PASS, NOT AN INDEX. An index was TRIED FIRST AND
--    REJECTED ON EVIDENCE: hypopg would not use it, and the plan says why --
--    the planner estimates 26,758 of 37,967 rows match `duplicate_of_id is null
--    and website is not null` (~70%), where a sequential scan is genuinely the
--    right plan. The waste is not the scan, it is doing it TWICE: the arm counts
--    stale rows in the outer query and re-counts the same population in a scalar
--    subquery for `with_website`. `count(*) filter (...)` computes both in a
--    single pass.
--
--    The two counts are IDENTICAL to the originals, not merely similar:
--      failures     = venues with a website AND (never checked OR checked >90d)
--                     -- now the FILTER, same predicate, same rows.
--      with_website = venues with a website, NO url_checked_at condition
--                     -- now count(*) over the arm's WHERE, which is exactly the
--                     subquery's WHERE. The url_checked_at test moved OUT of the
--                     WHERE and INTO the filter, which is what makes this legal.
--
-- MEASUREMENT HONESTY. The single-pass rewrite timed 38 ms against the original
-- arm's 1066 ms, but `venues` was cache-hot by then from repeated probing and a
-- like-for-like re-measure was not possible (see the PR body). Do NOT quote 28x.
-- What is structurally guaranteed, cache or no cache, is that this arm now reads
-- `venues` ONCE instead of TWICE, and that venue_closed_seo stops reading it at
-- all. Expect roughly 3.4 s -> 1.5-2.0 s, i.e. 4-5x headroom under the 8 s
-- ceiling instead of the present ~2x. Re-measure before believing it.
--
-- LEFT ALONE DELIBERATELY: dup_integrity's venues arm (649 ms) builds a hash of
-- all 37,967 venues to resolve 11,062 duplicate pointers, while the events,
-- personalities and news_articles arms use index nested-loops at 23-103 ms. A
-- covering index might flip the planner, but that was NOT verified -- and adding
-- an index to a disk-constrained database without proving it helps is the wrong
-- trade. It is the next place to look if this creeps back.
--
-- Nothing else in the function changes.

create index if not exists idx_venues_closed_seo_indexable
  on public.venues (closed_at)
  where closed_at is not null and seo_indexable is true;

comment on index public.idx_venues_closed_seo_indexable is
  'Serves release_gate_checks() venue_closed_seo. Partial on a near-empty predicate: without it that gate seq-scans all of venues (851 ms) to return 0 rows.';

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
    -- The `or category = 'cruising'` term is LOAD-BEARING and must not be dropped
    -- when this function is restated. `venues.safety_gated` is
    -- `location_is_high_risk(country_id, city_id) OR category = 'cruising'`
    -- (20261112100000), so a country-only comparison reports every gated cruising
    -- venue as drift. Measured on prod while this PR omitted it: 106 drift rows
    -- against the live arm's 0, over 107 gated cruising venues — and
    -- `city_safety_gate_drift` is `critical`, so that reds every open PR.
    -- 20261112100000 patched the live function by string surgery, which is why a
    -- full CREATE OR REPLACE keeps re-introducing the pre-fix text; 20270309161544
    -- restored it set-based and this restatement must carry it forward.
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
    count(*) filter (
      where v.url_checked_at is null
         or v.url_checked_at < now() - interval '90 days')::bigint,
    jsonb_build_object('with_website', count(*))
  from public.venues v
  where v.duplicate_of_id is null
    and nullif(v.website, '') is not null
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
