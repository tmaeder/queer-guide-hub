-- `release_gate_checks()` was timing out on PostgREST and failing `Critical
-- data-quality gates` on EVERY open PR, including PRs touching no SQL.
--
--     release_gate_checks -> HTTP 500:
--     {"code":"57014", "message":"canceling statement due to statement timeout"}
--
-- IT WAS NOT A GATE FAILING. Every `critical` gate reads 0; the script only
-- exits non-zero on critical failures, and its own log confirms the tag half
-- passed in the same run. The RPC simply did not finish inside PostgREST's
-- statement_timeout, so a green corpus reported as a red build and no gate was
-- evaluated at all -- the safety checks silently stopped running.
--
-- WHERE THE TIME WENT. `city_safety_gate_drift` called
-- `location_is_high_risk(country_id, city_id)` once PER ROW across venues,
-- events, hotels, organizations and guides. Measured with EXPLAIN ANALYZE on
-- prod:
--
--     venues   1295 ms
--     events   1230 ms
--     ------------------
--     the other 13 gates, together, under 200 ms
--
-- ~2.5 s of a ~2.9 s function, and a 2.9 s function under an 8 s ceiling has
-- less than 3x of headroom -- which prod load ate. Same shape, same remedy as
-- `20260928143000` did for `tag_hygiene_stats()`.
--
-- THE FIX IS SET-BASED, NOT AN INDEX. The function is STABLE but its arguments
-- differ per row, so nothing can be cached. Resolving the high-risk country SET
-- once (66 countries) and the city->country map once turns ~80k function calls
-- into two hash joins: **2525 ms -> 158 ms, a 16x cut** on the two hot arms.
--
-- THE PREDICATE IS COPIED VERBATIM from `location_is_high_risk`'s body rather
-- than re-derived, and the NULL case is made explicit: the function returns
-- `exists(...)`, which is FALSE for an unresolvable country, whereas
-- `x IN (set)` yields NULL -- hence the `coalesce(..., false)`. Getting that
-- wrong would silently under-report drift on exactly the rows with no country.
--
-- VERIFIED, NOT ASSUMED, and verified against the trap that the obvious check
-- is vacuous. Comparing the two forms' DRIFT COUNTS proves nothing today,
-- because both correctly return 0 -- absence needs a positive control. So the
-- PREDICATES were compared directly, row by row, on the live corpus:
--
--     venues  predicate disagreements: 0   (positive control: 1226 high-risk, both forms)
--     events  predicate disagreements: 0
--
-- and then the whole function was replaced inside a transaction and its output
-- diffed against the original's, one snapshot, before rolling back:
--
--     old_rows 15 | new_rows 15 | old_not_in_new 0 | new_not_in_old 0
--
-- Nothing else in the function changes.

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
    select 'venues' tbl, count(*) cnt from public.venues t
      left join cc on cc.id = t.city_id
      where t.duplicate_of_id is null
        and coalesce(t.safety_gated, false)
            is distinct from coalesce(coalesce(t.country_id, cc.country_id) in (select country_id from hr), false)
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
