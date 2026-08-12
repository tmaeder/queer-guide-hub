-- Two new release gates for the /help hotline corpus.
--
-- WHY, precisely: on 2026-08-11 we found that `mindlinetrans.org.uk` — the URL
-- we published to trans people in distress — had been re-registered and was
-- serving an offshore-gambling affiliate site. Our record said
-- `link_status: 'ok'` and `link_checked_at: '2026-06-05'`.
--
-- Two separate failures made that invisible, and each gets an arm here:
--
--   1. NOBODY RE-CHECKED. Every one of the 25 entries carried a
--      `link_checked_at` of 2026-06-05/06 — 67 days stale — and no gate looked
--      at that column at all. `hotline_url_live` only fires on
--      `link_status = 'broken'`, so a stale 'live' is indistinguishable from a
--      fresh one. `hotline_link_stale` makes the age of the evidence visible.
--
--   2. THE STATUS VOCABULARY HAD DRIFTED. Three rows held `link_status: 'ok'`,
--      which is not in the TS union ('live' | 'broken' | 'bot_blocked'), so
--      some writer was setting a value nothing else understood — and
--      `hotline_url_live` silently ignores any value it does not recognise.
--      `hotline_link_status_vocab` fails on an unknown value instead.
--
-- WHAT THESE GATES STILL CANNOT DO — read this before trusting them.
-- No SQL gate can detect a hijacked domain. The failure was in the page's
-- CONTENT, not in any column: the host resolved, returned 200, and would have
-- satisfied any status-only probe. `link_status: 'live'` therefore means "the
-- server answered", NEVER "this is still the operator's site". Only a content
-- check (does the page still mention the organisation?) or a human visit can
-- establish that. What these arms buy is that the evidence cannot go quietly
-- stale for two months again — which is the window the hijack landed in.
--
-- Both are 'high', not 'critical': a stale check is a prompt to look, not a
-- reason to block a release. The full function is restated rather than patched
-- in place — precedent 20260806140000, where live string surgery left the repo
-- copy wrong until 20260809100000 had to re-commit the whole thing.

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
