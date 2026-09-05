-- Event dedup: give the auto arms something to match, and tell the reviewer why.
--
-- MEASURED STATE BEFORE THIS MIGRATION. dedup_truth_sweep runs nightly at 05:50 in
-- mode='full', reports success, and merges nothing -- entity_merge_audit holds 645
-- event merges dated 2026-08-23/24/25 and zero since. It is not paused
-- (consecutive_failures = 0); both of its auto arms simply match zero pairs:
--
--     arm_venue_id   (0.97)  0 candidate pairs
--     arm_venue_name (0.96)  0 candidate pairs
--
-- Both need a venue. Of 47,868 live events, 2,604 (5.4%) carry venue_id and 8,385
-- (17.5%) carry venue_name; 39,383 (82%) carry neither. arm_venue_name additionally
-- demands a byte-identical start_date: 8 pairs share a despaced venue name, 0 also
-- share the instant. So every candidate fell through to the queue-only arms, and 84
-- pairs have been sitting open since 2026-08-09.
--
-- This migration is byte-identical to 20260929110100 except for the `when 'event'`
-- branch, one added declaration, and the queue-insert payload. It was produced by
-- splicing, not by retyping: 20260522000000 called itself a no-op re-assert and
-- silently reverted the title_containment rule, and that is not a mistake worth
-- repeating.
--
-- The new arms and both vetoes are explained at the branch itself.
--
-- Candidate limit 800 -> 1200 to absorb the widened blocking key. Merge cap (300),
-- queue cap (200), rejection memory, showtime suppression and the news guards are
-- untouched.

-- Cluster payload for one side of an event pair. A function rather than an inline
-- subquery so the sweep body stays readable and the shape has one definition.
CREATE OR REPLACE FUNCTION public._dedup_event_cluster_side(p_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'slug', e.slug,
    'start_date', e.start_date, 'city', e.city, 'venue_name', e.venue_name,
    'source', (select s.source_slug from public.event_sources s
               where s.event_id = e.id
               order by s.is_primary desc nulls last, s.first_seen_at limit 1))
  from public.events e where e.id = p_id;
$function$;

REVOKE ALL ON FUNCTION public._dedup_event_cluster_side(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._dedup_event_cluster_side(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_dedup_truth_sweep(p_type text, p_mode text DEFAULT 'queue_only'::text, p_merge_cap integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  r record;
  v_sql text;
  v_keep uuid; v_drop uuid; v_keep_t text; v_drop_t text;
  v_result jsonb; v_audit uuid; v_ins int;
  v_cluster jsonb;
  v_merged int := 0; v_queued int := 0; v_skipped int := 0; v_capped int := 0;
  v_would_merge int := 0; v_would_queue int := 0;
  v_queue_cap constant int := 200;
begin
  perform public.assert_admin_or_internal();
  if p_mode not in ('dry_run','queue_only','full') then
    raise exception 'unknown mode %', p_mode;
  end if;

  -- Common candidate shape: a_id, b_id, a_title, b_title, is_auto, conf,
  -- reason, dm (distance), aq/af/ac + bq/bf/bc (canonical ranking inputs).
  v_sql := case p_type
  when 'venue' then $q$
    with live as (
      select id, name, latitude lat, longitude lng, city, city_id,
             public.dedup_despace(name) dsp, public.dedup_core_tokens(name, city) core,
             quality_score::numeric q, is_featured::boolean f, created_at::timestamptz c
      from public.venues
      where duplicate_of_id is null and closed_at is null
        and review_status is distinct from 'archived'
        and data_source is distinct from 'refuge-restrooms'
        and name_normalized is not null and length(name_normalized) >= 3)
    select * from (
      select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
             (a.lat is not null and b.lat is not null
              and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150) is_auto,
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                  then 0.97 else 0.85::numeric end conf,
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                  then 'despace_geo' else 'despace_no_geo' end reason,
             public.haversine_m(a.lat,a.lng,b.lat,b.lng) dm,
             a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
      from live a join live b on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
      where length(a.dsp) >= 4
      union all
      select a.id, b.id, a.name, b.name,
             (a.lat is not null and b.lat is not null
              and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150),
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                  then 0.92 else 0.75 end,
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                  then 'core_token_geo' else 'core_token_no_geo' end,
             public.haversine_m(a.lat,a.lng,b.lat,b.lng),
             a.q, a.f, a.c, b.q, b.f, b.c
      from live a join live b on a.city_id = b.city_id and a.id < b.id
        and a.core = b.core and a.dsp <> b.dsp
      where cardinality(a.core) >= 1
    ) u order by is_auto desc, conf desc limit 800 $q$
  -- Blocking key: same calendar day, and either an identical despaced title or one
  -- title containing the other (>= 8 chars a side). Containment restores the rule
  -- 20260510110000 added and 20260522000000 reverted while calling itself a no-op --
  -- but only as a CANDIDATE generator, and only when the pair also agrees on the
  -- exact instant and city, because hand-reading the cohort shows its failure mode is
  -- sub-events, not duplicates ("Muscle Classic V Pre-Party" vs "Muscle Classic V",
  -- "Video Lounge at the Original GLBT Expo" vs "The Original GLBT Expo"). Those are
  -- programme relationships -- exactly what _event_merge_core's umbrella guard
  -- refuses -- so containment never reaches is_auto.
  --
  -- That is why `not same_title` is the FIRST rung of the ladder rather than a late
  -- one. Widening the blocking key silently widened the two pre-existing venue arms,
  -- which were written for an exact-title key and merge at 0.97/0.96: measured, 10
  -- containment pairs reached them. All 10 happen to be true duplicates ("Explicit"
  -- vs "EXPLICIT - Nov 13th" at Kauz), but arm_venue_id accepts a +/-48h spread at one
  -- venue, so "Muscle Classic V Pre-Party" and "Muscle Classic V" at the same venue
  -- two hours apart would have auto-merged a sub-event into its parent. Putting the
  -- containment rung first makes every later rung implicitly same_title, so the
  -- invariant this comment states is the one the code enforces.
  --
  -- The new auto arm is exact_instant_same_city, and it comes from the reviewers.
  -- All 50 event pairs a human has ever rejected carry the same note, "separate
  -- showtimes of one production", and EVERY one of them has a different start_date.
  -- Meanwhile 66 pairs sat open with an identical start_date. Two events at the same
  -- instant in the same city under the same title are not two showings of anything.
  --
  -- Two vetoes, both found by reading rows rather than by reasoning:
  --   * DIFFERENT CITY IS ABSOLUTE. "Dining out for Life" runs the same day in
  --     Asheville, Seattle and Minneapolis; "Transgender Day of Remembrance" in
  --     Charlotte and New York. `is not distinct from` is NOT the test -- two NULL
  --     city_ids satisfy it, and 2 live pairs are exactly that. A null city is not
  --     evidence of a shared city.
  --   * MIDNIGHT IS A PLACEHOLDER, NOT A MEASUREMENT. Two rows both stamped 00:00
  --     agree only on the date, which is already the blocking key, so they add no
  --     evidence and drop to review.
  -- A venue-name disagreement also drops to review: same title, same instant, same
  -- city but two different named venues is ambiguous, not identical.
  --
  -- ONE LADDER. `arm` is chosen once, and is_auto/conf/reason are all read off it.
  -- Writing the reason and the confidence as two parallel CASE expressions is what
  -- let them disagree in an earlier draft of this branch -- measured, it produced
  -- 'exact_instant_midnight' at both 0.85 and 0.80, the 0.80 rows being pairs that
  -- did not share an instant at all. A single ladder makes that unspellable.
  --
  -- Every arm predicate is coalesced to false. `a.vn = b.vn` is NULL when one side
  -- has no venue name, which made arm_venue_name -- and therefore is_auto -- NULL on
  -- live rows. NULL was treated as not-auto downstream, so this preserves behaviour
  -- while removing a null that would otherwise reach the reviewer as
  -- `auto_eligible: null`.
  when 'event' then $q$
    with live as (
      select e.id, e.title, e.venue_id, e.start_date, e.city_id,
             public.dedup_despace(e.title) dsp,
             public.dedup_despace(e.venue_name) vn,
             s.source_slug, s.source_entity_id,
             e.quality_score::numeric q, e.is_featured::boolean f,
             e.created_at::timestamptz c
      from public.events e
      left join (
        select distinct on (event_id) event_id, source_slug, source_entity_id
        from public.event_sources
        order by event_id, is_primary desc nulls last, first_seen_at
      ) s on s.event_id = e.id
      where e.duplicate_of_id is null and coalesce(e.status,'') <> 'archived'
        and e.title_normalized is not null and length(e.title_normalized) >= 3),
    pairs as (
      select a.id a_id, b.id b_id, a.title a_title, b.title b_title,
             coalesce(a.dsp = b.dsp, false) same_title,
             coalesce(a.start_date = b.start_date
                      and a.city_id is not null and a.city_id = b.city_id, false) same_instant_city,
             coalesce(a.start_date::time = time '00:00:00', false) midnight,
             coalesce(a.vn is not null and b.vn is not null and a.vn <> b.vn, false) venue_conflict,
             coalesce(a.venue_id is not null and a.venue_id = b.venue_id
              and abs(extract(epoch from (a.start_date - b.start_date))) < 48*3600, false) arm_venue_id,
             coalesce(a.vn is not null and a.vn = b.vn and length(a.vn) >= 3
              and a.start_date = b.start_date, false) arm_venue_name,
             coalesce(a.vn is not null and b.vn is not null
              and length(a.vn) >= 4 and length(b.vn) >= 4
              and (position(a.vn in b.vn) > 0 or position(b.vn in a.vn) > 0)
              and a.source_slug is distinct from b.source_slug
              and abs(extract(epoch from (a.start_date - b.start_date))) <= 2*3600, false) arm_cross_source,
             coalesce(a.source_slug = b.source_slug
                      and a.source_entity_id is distinct from b.source_entity_id
                      and a.start_date <> b.start_date, false) is_showtime,
             a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
      from live a join live b on a.id < b.id
        and a.start_date::date = b.start_date::date
        and (a.dsp = b.dsp
             or (length(a.dsp) >= 8 and length(b.dsp) >= 8
                 and (position(a.dsp in b.dsp) > 0 or position(b.dsp in a.dsp) > 0)))
      where length(a.dsp) >= 4 and length(b.dsp) >= 4),
    armed as (
      select a_id, b_id, a_title, b_title, aq, af, ac, bq, bf, bc,
             case when not same_title then 'title_containment_same_instant'
                  when arm_venue_id then 'despace_same_venue_48h'
                  when arm_venue_name then 'despace_same_venue_name_exact_ts'
                  when same_instant_city
                       and not midnight and not venue_conflict then 'exact_instant_same_city'
                  when arm_cross_source then 'cross_source_venue_substring_2h'
                  when same_instant_city and venue_conflict then 'exact_instant_venue_conflict'
                  when same_instant_city and midnight then 'exact_instant_midnight'
                  else 'title_day_no_venue' end arm
      from pairs
      -- A containment pair that does not also agree on instant+city is dropped, not
      -- queued at 0.80: widening the blocking key must not widen the fallback arm,
      -- whose queue a human already had to clear 50 rows of.
      where not is_showtime and (same_title or same_instant_city))
    select a_id, b_id, a_title, b_title,
           arm in ('despace_same_venue_48h','despace_same_venue_name_exact_ts',
                   'exact_instant_same_city') is_auto,
           case arm when 'despace_same_venue_48h'           then 0.97
                    when 'despace_same_venue_name_exact_ts' then 0.96
                    when 'exact_instant_same_city'          then 0.95
                    when 'cross_source_venue_substring_2h'  then 0.90
                    when 'title_containment_same_instant'   then 0.85
                    when 'exact_instant_venue_conflict'     then 0.85
                    when 'exact_instant_midnight'           then 0.85
                    else 0.80 end::numeric conf,
           arm reason,
           null::double precision dm, aq, af, ac, bq, bf, bc
    from armed
    order by is_auto desc, conf desc limit 1200 $q$
  when 'marketplace' then $q$
    with live as (
      select id, title, merchant_domain,
             public.dedup_despace(title) dsp, public.dedup_core_tokens(title, null) core,
             quality_score::numeric q, featured::boolean f, created_at::timestamptz c
      from public.marketplace_listings
      where duplicate_of_id is null and status = 'active' and merchant_domain is not null
        and title_normalized is not null and length(title_normalized) >= 3)
    select * from (
      select a.id a_id, b.id b_id, a.title a_title, b.title b_title,
             true is_auto, 0.97::numeric conf, 'same_merchant_key' reason,
             null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
      from live a join live b on a.merchant_domain = b.merchant_domain
        and a.id < b.id and a.dsp = b.dsp
      where length(a.dsp) >= 4
    ) u order by is_auto desc limit 800 $q$
  when 'city' then $q$
    with live as (
      select id, name, country_id, latitude lat, longitude lng, wikidata_qid qid,
             public.dedup_despace(name) dsp,
             completeness_score::numeric q, is_capital::boolean f, created_at::timestamptz c
      from public.cities
      where duplicate_of_id is null and shell_status is distinct from 'merged')
    select * from (
      select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
             (a.lat is not null and b.lat is not null
              and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 10000) is_auto,
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 10000
                  then 0.97 else 0.85::numeric end conf,
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 10000
                  then 'despace_geo' else 'despace_no_geo' end reason,
             public.haversine_m(a.lat,a.lng,b.lat,b.lng) dm,
             a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
      from live a join live b on a.country_id = b.country_id and a.id < b.id and a.dsp = b.dsp
      where length(a.dsp) >= 4
      union all
      -- Geo-only arm: same country, under 2 km, DIFFERENT despaced keys. This is
      -- the exonym / native-script / qualifier class the key arm above cannot
      -- represent, and it is NEVER auto-eligible -- see the migration header.
      select a.id, b.id, a.name, b.name,
             false, 0.60::numeric, 'geo_only_2km',
             public.haversine_m(a.lat,a.lng,b.lat,b.lng),
             a.q, a.f, a.c, b.q, b.f, b.c
      from live a join live b on a.country_id = b.country_id and a.id < b.id
        and a.dsp <> b.dsp
      where a.lat is not null and b.lat is not null
        and abs(a.lat - b.lat) < 0.05 and abs(a.lng - b.lng) < 0.05
        and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 2000
        and not (a.qid is not null and b.qid is not null and a.qid <> b.qid)
    ) u order by is_auto desc, conf desc limit 800 $q$
  when 'personality' then $q$
    with live as (
      select id, name, wikidata_qid, birth_date, public.dedup_despace(name) dsp,
             quality_score::numeric q, is_featured::boolean f, created_at::timestamptz c
      from public.personalities
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           ((a.wikidata_qid is not null and a.wikidata_qid = b.wikidata_qid)
            or (a.birth_date is not null and a.birth_date = b.birth_date)) is_auto,
           case when (a.wikidata_qid is not null and a.wikidata_qid = b.wikidata_qid)
                  or (a.birth_date is not null and a.birth_date = b.birth_date)
                then 0.97 else 0.75::numeric end conf,
           case when (a.wikidata_qid is not null and a.wikidata_qid = b.wikidata_qid)
                  or (a.birth_date is not null and a.birth_date = b.birth_date)
                then 'despace_corroborated' else 'despace_namesake' end reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'hotel' then $q$
    with live as (
      select id, name, city_id, latitude::numeric lat, longitude::numeric lng,
             public.dedup_despace(name) dsp,
             null::numeric q, featured::boolean f, created_at::timestamptz c
      from public.hotels
      where duplicate_of_id is null and city_id is not null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           (a.lat is not null and b.lat is not null
            and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150) is_auto,
           case when a.lat is not null and b.lat is not null
                 and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                then 0.96 else 0.80::numeric end conf,
           case when a.lat is not null and b.lat is not null
                 and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                then 'despace_geo' else 'despace_no_geo' end reason,
           public.haversine_m(a.lat,a.lng,b.lat,b.lng) dm,
           a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'queer_village' then $q$
    with live as (
      select id, name, city_id, public.dedup_despace(name) dsp,
             completeness_score::numeric q, featured::boolean f, created_at::timestamptz c
      from public.queer_villages
      where duplicate_of_id is null and city_id is not null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           true is_auto, 0.96::numeric conf, 'despace_same_city' reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    limit 800 $q$
  when 'organization' then $q$
    with live as (
      select id, name, city_id, website_domain, public.dedup_despace(name) dsp,
             completeness_score::numeric q, false::boolean f, created_at::timestamptz c
      from public.organizations
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           (a.website_domain is not null and a.website_domain = b.website_domain) is_auto,
           case when a.website_domain is not null and a.website_domain = b.website_domain
                then 0.96 else 0.80::numeric end conf,
           case when a.website_domain is not null and a.website_domain = b.website_domain
                then 'despace_domain' else 'despace_same_city' end reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
      and ((a.website_domain is not null and a.website_domain = b.website_domain)
           or (a.city_id is not null and a.city_id = b.city_id))
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'group' then $q$
    with live as (
      select id, name, nullif(lower(btrim(coalesce(city,''))),'') cty,
             public.dedup_despace(name) dsp,
             member_count::numeric q, featured::boolean f, created_at::timestamptz c
      from public.community_groups
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           (a.cty is not null and a.cty = b.cty) is_auto,
           case when a.cty is not null and a.cty = b.cty then 0.95 else 0.70::numeric end conf,
           case when a.cty is not null and a.cty = b.cty
                then 'despace_same_city' else 'despace_only' end reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'milestone' then $q$
    with live as (
      select id, title, extract(year from date) yr, public.dedup_despace(title) dsp,
             null::numeric q, false::boolean f, created_at::timestamptz c
      from public.milestones
      where duplicate_of_id is null and date is not null)
    select a.id a_id, b.id b_id, a.title a_title, b.title b_title,
           true is_auto, 0.95::numeric conf, 'title_year' reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.yr = b.yr and a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 6
    limit 800 $q$
  -- news: same feed, same day, same despaced title AND a byte-identical body.
  -- A shared headline alone is multi-outlet coverage -- a news_stories concern
  -- that must never merge -- so the identity has to come from the article
  -- itself. is_auto is unconditionally true here: the join IS the auto gate,
  -- and a news pair that does not clear it is dropped rather than queued (see
  -- the guards in the loop below).
  --
  -- Only two arms, both measured on the live corpus:
  --   content        17 pairs. Byte-identical bodies behind the same headline
  --                  on the same day from the same feed. Spot-checked: they are
  --                  Google-News re-ingests of one article under different
  --                  opaque token URLs ("Senegal's Prime Minister Pushes for
  --                  Anti-LGBT Law" x4, "Turkey puts 11 on trial" x4).
  --   canonical_url   0 pairs today, but it is a URL identity and cannot be
  --                  wrong -- only 4 canonical_urls in the whole table are
  --                  shared at all, max 2 rows each.
  --
  -- image_hash and excerpt were tried and REJECTED as arms. They are not
  -- identities, they are reuse: 5,120 rows share an image_hash with some other
  -- row, one image is reused across 104 articles, and 83 hashes recur 10+
  -- times (outlets reuse a section/stock image). Between them those two arms
  -- contributed 19 of the 36 pairs the wider gate produced, including its only
  -- live candidate -- "Summer Travel and LGBTQ Music", which matched on image
  -- alone while its body and excerpt both differed, i.e. not a duplicate.
  --
  -- No 90-day window. Every one of the 17 real duplicates was published
  -- Feb-Apr 2026; a 90-day cutoff (which the other types use to bound a fuzzy
  -- join) would have made a rule that is exact hide every case it exists for.
  -- length(content) >= 32 keeps a trivially short shared stub from ever
  -- standing in as an identity.
  when 'news' then $q$
    with live as (
      select id, title, canonical_url, content,
             source_id, published_at::date pday, public.dedup_despace(title) dsp,
             quality_score::numeric q, is_featured::boolean f, created_at::timestamptz c
      from public.news_articles
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.title a_title, b.title b_title,
           true is_auto, 0.99::numeric conf, 'same_source_identical_body' reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b
      on a.source_id = b.source_id and a.pday = b.pday and a.id < b.id and a.dsp = b.dsp
     and ( (a.content is not null and length(a.content) >= 32 and a.content = b.content)
        or (a.canonical_url is not null and a.canonical_url <> '' and a.canonical_url = b.canonical_url) )
    where length(a.dsp) >= 6
    limit 800 $q$
  when 'country' then $q$
    with live as (
      select id, name, public.dedup_despace(name) dsp,
             content_completeness_score::numeric q, false::boolean f, created_at::timestamptz c
      from public.countries
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           true is_auto, 0.95::numeric conf, 'despace' reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    limit 800 $q$
  else null end;

  if v_sql is null then raise exception 'unsupported type %', p_type; end if;

  for r in execute v_sql loop
    -- rejection memory: an admin already said "not a duplicate"
    if exists (
      select 1 from public.dedup_review_queue
      where entity_type = p_type and status = 'rejected'
        and least(keep_id, drop_id) = least(r.a_id, r.b_id)
        and greatest(keep_id, drop_id) = greatest(r.a_id, r.b_id)
    ) then v_skipped := v_skipped + 1; continue; end if;

    -- News is fully automatic: auto-merge or drop, never a human. Dormant with
    -- the current gate (is_auto is always true) but it keeps the promise if the
    -- gate ever grows a non-auto arm again.
    if p_type = 'news' and not r.is_auto then
      v_skipped := v_skipped + 1; continue;
    end if;

    -- canonical pick: quality desc -> featured -> oldest
    if (coalesce(r.aq,-1) >  coalesce(r.bq,-1))
       or (coalesce(r.aq,-1) = coalesce(r.bq,-1) and coalesce(r.af,false) and not coalesce(r.bf,false))
       or (coalesce(r.aq,-1) = coalesce(r.bq,-1) and coalesce(r.af,false) = coalesce(r.bf,false) and r.ac <= r.bc)
    then v_keep := r.a_id; v_drop := r.b_id; v_keep_t := r.a_title; v_drop_t := r.b_title;
    else v_keep := r.b_id; v_drop := r.a_id; v_keep_t := r.b_title; v_drop_t := r.a_title; end if;

    if p_mode = 'dry_run' then
      if r.is_auto then v_would_merge := v_would_merge + 1;
      else v_would_queue := v_would_queue + 1; end if;
      continue;
    end if;

    if r.is_auto and p_mode = 'full' then
      if v_merged >= p_merge_cap then v_capped := v_capped + 1; continue; end if;
      begin
        if p_type = 'venue' then v_result := public.merge_venues(v_keep, v_drop);
        elsif p_type = 'city' then v_result := public.merge_cities(v_keep, v_drop);
        else v_result := public.merge_entities(p_type => p_type, p_keep_id => v_keep, p_drop_id => v_drop);
        end if;
        v_audit := (v_result->>'audit_id')::uuid;
        v_merged := v_merged + 1;
        update public.dedup_review_queue
           set status = 'superseded', reviewed_at = now()
         where status = 'open' and entity_type = p_type
           and (keep_id = v_drop or drop_id = v_drop);
        perform public._dedup_write_corroboration_signal(p_type, v_keep, v_drop, v_audit, r.reason);
      exception when others then v_skipped := v_skipped + 1;
      end;
    else
      -- The load-bearing half of the promise. This branch is reached by an
      -- auto-eligible pair whenever mode <> 'full', so gating on is_auto above
      -- is not enough -- a flip of admin_automations.conditions.mode back to
      -- queue_only would otherwise put news in front of a human again.
      if p_type = 'news' then v_skipped := v_skipped + 1; continue; end if;
      if v_queued >= v_queue_cap then v_capped := v_capped + 1; continue; end if;
      -- Events carry the fields the decision actually turns on. Every one of the 50
      -- event pairs rejected to date hinged on the start time, and the old payload
      -- (two titles, a null distance and a match_type) did not carry it -- so the
      -- reviewer had to leave the inbox to tell a duplicate from a second showtime.
      if p_type = 'event' then
        v_cluster := jsonb_build_object(
          'keep', public._dedup_event_cluster_side(v_keep),
          'drop', public._dedup_event_cluster_side(v_drop),
          'distance_m', r.dm, 'match_type', r.reason, 'auto_eligible', r.is_auto);
      else
        v_cluster := jsonb_build_object(
          'keep', jsonb_build_object('id', v_keep, 'title', v_keep_t),
          'drop', jsonb_build_object('id', v_drop, 'title', v_drop_t),
          'distance_m', r.dm, 'match_type', r.reason, 'auto_eligible', r.is_auto);
      end if;
      insert into public.dedup_review_queue
        (entity_type, keep_id, drop_id, cluster, confidence, reason, source)
      values (p_type, v_keep, v_drop, v_cluster, r.conf, r.reason, 'sweep')
      on conflict do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then
        v_queued := v_queued + 1;
        perform public._dedup_set_needs_attention(p_type, v_keep, true);
        perform public._dedup_set_needs_attention(p_type, v_drop, true);
      end if;
    end if;
  end loop;

  if p_mode = 'full' and v_merged > 0 then
    perform public.collapse_entity_dup_chains(p_type);
  end if;

  return jsonb_build_object('type', p_type, 'mode', p_mode,
    'auto_merged', v_merged, 'queued', v_queued, 'skipped', v_skipped, 'capped', v_capped,
    'would_merge', v_would_merge, 'would_queue', v_would_queue);
end; $function$;


-- ---------------------------------------------------------------------------
-- Backlog: the open queue predates these arms and cannot relabel itself.
-- ---------------------------------------------------------------------------
-- `insert ... on conflict do nothing` means a new arm only ever affects NEW pairs
-- (20260825111058 learned this and had to issue a hand-written re-score). The 84 open
-- event rows would otherwise keep their stale `title_day_no_venue` / 0.80 label
-- forever, which is the label a reviewer reads.
--
-- Rather than recompute the arms here -- a second implementation that can silently
-- drift from the branch above, which is exactly how the last one went wrong -- the
-- machine-generated open rows are marked `superseded` so the sweep regenerates them
-- from its own logic on the next run. The engine stays the single definition.
--
-- Two deliberate limits. Only rows whose reason is a machine reason are touched, so
-- the hand-written entries (the Folsom Europe pocket-guide notes) keep their prose.
-- And queue age resets for the rows that come back: the oldest is 2026-08-09 and all
-- of them are being re-triaged anyway, so that is a fair price for labels that match
-- the engine. Nothing is lost -- `superseded` keeps the row and its history.
--
-- Rejections are NOT touched. dedup_review_queue rows with status='rejected' are the
-- sweep's permanent memory and re-opening them would re-ask a human a question they
-- have already answered 50 times.
update public.dedup_review_queue
   set status = 'superseded', reviewed_at = now()
 where entity_type = 'event'
   and status = 'open'
   and source = 'sweep'
   and reason in ('title_day_no_venue','cross_source_venue_substring_2h');

-- ---------------------------------------------------------------------------
-- Assert the thing this migration exists to fix.
-- ---------------------------------------------------------------------------
-- The failure being repaired is an engine that runs, succeeds, and matches nothing.
-- "0 bad merges" also passes in that state, so a dry run that produces no auto pairs
-- must fail here rather than look clean.
--
-- Measured expectation at authoring time: 37, entirely from exact_instant_same_city;
-- the two venue arms are reachable but empty, because venue_name is null on the feeds
-- that would fill them. 20270822093715 backfills that column later in this series and
-- the number becomes 39 (35 exact-instant + 4 venue_name) -- the 0.96 arm coming alive
-- is the outcome that migration exists for, and is why this band is not a fixed count.
--
-- A ZERO is the regression this migration removes. An implausibly large number means a
-- veto (city / midnight / venue conflict / containment) stopped firing.
--
-- The dry run is NOT wrapped in an exception handler. An earlier draft caught any
-- failure and downgraded it to a notice, which would have let the migration skip its
-- own assertion and report success -- the same "absence of evidence recorded as
-- evidence of absence" shape the rest of this series exists to remove. It was checked
-- against prod first: assert_admin_or_internal() passes in a migration context and
-- run_dedup_truth_sweep('event','dry_run') returns normally, so a failure here is a
-- real failure and should stop the deploy.
do $verify$
declare v_res jsonb; v_auto int; v_queue int;
begin
  v_res := public.run_dedup_truth_sweep('event', 'dry_run');

  v_auto  := coalesce((v_res->>'would_merge')::int, 0);
  v_queue := coalesce((v_res->>'would_queue')::int, 0);
  raise notice 'event dry run: would_merge=% would_queue=%', v_auto, v_queue;

  if v_auto = 0 then
    raise exception 'event auto arms still match nothing (would_merge=0) -- this migration did not fix what it exists to fix';
  end if;
  if v_auto > 400 then
    raise exception 'event auto arms match % pairs, far above the 37 measured: a veto (city / midnight / venue conflict / containment) is not firing', v_auto;
  end if;
end $verify$;
