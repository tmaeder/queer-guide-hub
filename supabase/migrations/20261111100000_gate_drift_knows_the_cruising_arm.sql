-- `city_safety_gate_drift` is reporting 96 venues that are CORRECTLY gated.
--
-- `20261110100000_cruising_category_safety_gate` (#3241, merged 2026-08-30 18:34)
-- moved the venues gate off pure geography:
--
--   venue_is_safety_gated(country, city, category)
--     = location_is_high_risk(country, city) OR category = 'cruising'
--
-- It backfilled the 112 ungated cruising venues and asserted a post-condition, so
-- those rows are right. What did not move is the RELEASE GATE, whose venues arm
-- still compares stored `safety_gated` against the country-risk set alone. Every
-- cruising venue in a non-criminalizing country therefore reads as drift:
-- stored true, expected false.
--
-- Measured: the scheduled run on main at 2026-08-30T05:22Z (before #3241) reported
-- `city_safety_gate_drift: 0`; the first run after it reports 96, ALL of them
-- venues, with events/hotels/organizations/guides still 0. That is exactly the
-- shape this predicts — the cruising cohort minus the ones geography already gated.
--
-- Two reasons this is not cosmetic:
--
-- 1. It is a `critical` gate, so it blocks EVERY pull request in the repo until it
--    reads 0 — the same shape as a migration-drift red, where one stale artifact
--    stops unrelated work.
-- 2. Worse, it is a sentinel that now cries wolf. A REAL ungating — a venue in a
--    criminalizing country that went public — would arrive as 97 instead of 96 and
--    nobody would look. A safety check that is permanently nonzero has stopped
--    being a safety check.
--
-- THE LESSON, because the file being patched already tried to prevent this. Its
-- header says the predicate is "copied verbatim from the body of
-- location_is_high_risk so the two cannot diverge", and that is true and still
-- holds: it guards against `location_is_high_risk` changing underneath. It cannot
-- guard against a TABLE acquiring a different predicate, which is what happened —
-- venues stopped being described by `location_is_high_risk` at all. #3241 created
-- `venue_is_safety_gated` precisely so "the trigger and the country-recompute
-- cannot drift" and named both readers it knew about. This gate was a third one.
-- Inlining protects the copy from the original; it does not enumerate the copies.
--
-- WHY THE ARM STAYS INLINED. The whole point of
-- `20261021110000_release_gate_checks_set_based_safety_drift` was to stop calling a
-- predicate once per row — it measured the venues arm at 1295 ms that way. Calling
-- venue_is_safety_gated() per row would reintroduce exactly that, on the largest
-- table in the check. The expression below has the same shape as that function's
-- body, with the geographic half left as the existing set membership.
--
-- DIRECTION IS PRESERVED, which is the part that matters for a safety gate. This
-- only ADDS `or category = 'cruising'` to the EXPECTED value:
--   * cruising venue, gated       -> expected true,  stored true  -> clean
--   * cruising venue, NOT gated   -> expected true,  stored false -> STILL FLAGGED
--   * high-risk venue, NOT gated  -> expected true,  stored false -> STILL FLAGGED
-- Nothing detectable before becomes undetectable; the check only gets better at
-- describing the system it watches.
--
-- Only the venues arm changes. events / hotels / organizations / guides have no
-- category column and are still purely geographic, so `location_is_high_risk`
-- remains the right predicate for them. Everything else here is restated
-- byte-for-byte from 20261021110000 — it is one SQL body and a single arm cannot
-- be patched in place.

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
  -- Stored `safety_gated` vs a live evaluation of the gating predicate. Any
  -- nonzero value means content is gated (or ungated) against a rule it no longer
  -- matches — a city repointed at another country, or a category that now gates.
  -- See the header for the UPDATE-no-op failure this exists to catch.
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
    -- venues: geography OR category, mirroring venue_is_safety_gated(). The four
    -- tables below have no category column and stay purely geographic.
    select 'venues' tbl, count(*) cnt from public.venues t
      left join cc on cc.id = t.city_id
      where t.duplicate_of_id is null
        and coalesce(t.safety_gated, false)
            is distinct from (
              coalesce(coalesce(t.country_id, cc.country_id) in (select country_id from hr), false)
              or coalesce(t.category = 'cruising', false)
            )
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

-- Post-condition. The venues arm must agree with venue_is_safety_gated() on every
-- live row — asserted against the function rather than against a literal 0, so a
-- REAL drift (which this migration must not paper over) still fails loudly here
-- instead of being written off as "the cruising thing".
do $$
declare
  v_gate_venues  bigint;
  v_true_drift   bigint;
begin
  select (detail->>'venues')::bigint into v_gate_venues
    from public.release_gate_checks() where gate = 'city_safety_gate_drift';

  select count(*) into v_true_drift
    from public.venues v
   where v.duplicate_of_id is null
     and coalesce(v.safety_gated, false)
         is distinct from public.venue_is_safety_gated(v.country_id, v.city_id, v.category);

  if v_gate_venues is distinct from v_true_drift then
    raise exception
      'gate venues arm (%) disagrees with venue_is_safety_gated (%) — the inlined predicate is not a faithful copy',
      v_gate_venues, v_true_drift;
  end if;

  raise notice 'city_safety_gate_drift venues arm now reads % (was 96, all correctly-gated cruising venues)', v_gate_venues;
end;
$$;
