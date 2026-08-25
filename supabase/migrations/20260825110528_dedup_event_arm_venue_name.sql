-- Event dedup: make the auto-merge arm reachable, drop showtime noise, unwindow.
--
-- Measured on prod 2026-08-24/25, before this migration:
--   * 47,815 live events, 217 exact pairs (despaced title + same calendar day)
--   * 95 open dedup_review_queue rows for entity_type='event'
--   * 0 of them at confidence >= 0.95, so run_dedup_review_autoapprove could
--     never touch one; oldest open row 2026-08-09
--   * 0 auto-eligible pairs, and that is structural, not a coincidence:
--     the event arm auto-merges only on a.venue_id = b.venue_id, and only
--     2,611 of 47,815 events (5.5%) carry a venue_id at all. No pair shared one.
--
-- Three changes, all inside the `when 'event'` candidate SQL. Everything else in
-- run_dedup_truth_sweep is byte-identical to 20260809100000 (verified: md5 of the
-- live prosrc equals md5 of that file's body, so the repo is still the truth --
-- see that file's header for why this check is mandatory before any replace).
--
-- 1. A second auto arm on dedup_despace(venue_name) with an EXACT timestamp.
--    venue_name text is weaker identity than a resolved venue_id, so it gets a
--    tighter time gate than arm 1's +/-48h rather than the same one. This is what
--    catches the real mechanical duplicates: the siegessaeule scraper emitted one
--    weekly event under two slugs (mix/jungschwuppen-late-night/2026-09-04/20:00
--    and mix/romeo-julius-23/2026-09-04/20:00) -- same title, same venue, same
--    instant, 31 pairs from one series.
--
-- 2. is_showtime drops separate performances of one production. 103 of the 217
--    pairs are same source + distinct source_entity_id + distinct start time,
--    i.e. the source itself is telling us these are two sittings (Bob The Drag
--    Queen, San Antonio, 00:00 and 02:30 UTC, each with its own Ticketmaster id).
--    They are not duplicates and they were 50 of the 95 rows a human never
--    resolved. The coalesce(..., false) is load-bearing: a null source_slug on
--    one side makes the whole conjunction NULL, and NULL is not false -- measured,
--    it happens on 2 pairs.
--
-- 3. The 90-day window is gone. It hid 126 pairs, because ~75% of this corpus is
--    past events from the Wayback import. The caps (p_merge_cap 300, v_queue_cap
--    200) and `limit 800` bound the work; the whole corpus yields 114 candidates.
--
-- A third arm, cross_source_venue_substring_2h, only RAISES CONFIDENCE to 0.90 and
-- is deliberately NOT part of is_auto. Those pairs are nearly all real
-- (display-magazin vs gay-ch: "Heaven Club"/"Heaven", "Kweer Cafe Bar"/"Kweer",
-- "Suedpol"/"Suedpol Buvette", 15-30 min apart) but venue-name containment is
-- evidence, not identity. It exists so a human can select them as one batch.
--
-- Measured and rejected as arms:
--   * identical normalized URL -- 218 pairs, but 214 are venue homepages
--     (heavenclub.ch/), only 5 have a deep path. events.website is mostly the
--     venue's front page, not the event.
--   * same title +/-1 day -- 108 pairs, sampled as legitimate second sittings
--     (Regenbogenhaus Fri afternoon + Sat morning, "Pride and Prejudice" matinee
--     and evening). The same-calendar-day gate stays.
--   * (source_slug, source_entity_id) collisions -- 0 pairs. Ingest idempotency
--     holds; every duplicate here is cross-source or same-source-different-slug.

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
  when 'event' then $q$
    with live as (
      select e.id, e.title, e.venue_id, e.start_date,
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
             (a.venue_id is not null and a.venue_id = b.venue_id
              and abs(extract(epoch from (a.start_date - b.start_date))) < 48*3600) arm_venue_id,
             (a.vn is not null and a.vn = b.vn and length(a.vn) >= 3
              and a.start_date = b.start_date) arm_venue_name,
             (a.vn is not null and b.vn is not null
              and length(a.vn) >= 4 and length(b.vn) >= 4
              and (position(a.vn in b.vn) > 0 or position(b.vn in a.vn) > 0)
              and a.source_slug is distinct from b.source_slug
              and abs(extract(epoch from (a.start_date - b.start_date))) <= 2*3600) arm_cross_source,
             coalesce(a.source_slug = b.source_slug
                      and a.source_entity_id is distinct from b.source_entity_id
                      and a.start_date <> b.start_date, false) is_showtime,
             a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
      from live a join live b on a.id < b.id and a.dsp = b.dsp
        and a.start_date::date = b.start_date::date
      where length(a.dsp) >= 4)
    select a_id, b_id, a_title, b_title,
           (arm_venue_id or arm_venue_name) is_auto,
           case when arm_venue_id     then 0.97
                when arm_venue_name   then 0.96
                when arm_cross_source then 0.90
                else 0.80 end::numeric conf,
           case when arm_venue_id     then 'despace_same_venue_48h'
                when arm_venue_name   then 'despace_same_venue_name_exact_ts'
                when arm_cross_source then 'cross_source_venue_substring_2h'
                else 'title_day_no_venue' end reason,
           null::double precision dm, aq, af, ac, bq, bf, bc
    from pairs
    where not is_showtime
    order by is_auto desc, conf desc limit 800 $q$
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
      select id, name, country_id, latitude lat, longitude lng,
             public.dedup_despace(name) dsp,
             completeness_score::numeric q, is_capital::boolean f, created_at::timestamptz c
      from public.cities
      where duplicate_of_id is null and shell_status is distinct from 'merged')
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
    order by is_auto desc limit 800 $q$
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
      insert into public.dedup_review_queue
        (entity_type, keep_id, drop_id, cluster, confidence, reason, source)
      values (p_type, v_keep, v_drop,
              jsonb_build_object(
                'keep', jsonb_build_object('id', v_keep, 'title', v_keep_t),
                'drop', jsonb_build_object('id', v_drop, 'title', v_drop_t),
                'distance_m', r.dm, 'match_type', r.reason, 'auto_eligible', r.is_auto),
              r.conf, r.reason, 'sweep')
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

-- Carried forward unchanged from 20260809100000 -- these four assertions are the
-- only thing standing between a future full-body replace and a silent revert of
-- the news promises. Two event assertions are added below.
DO $verify$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_dedup_truth_sweep';

  IF position('same_source_identical_body' in v_src) = 0 THEN
    RAISE EXCEPTION 'news identity gate missing from run_dedup_truth_sweep';
  END IF;
  IF position('if p_type = ''news'' then v_skipped := v_skipped + 1; continue; end if;' in v_src) = 0 THEN
    RAISE EXCEPTION 'news never-queue guard missing from run_dedup_truth_sweep';
  END IF;
  IF position('same_merchant_tokens' in v_src) > 0 THEN
    RAISE EXCEPTION 'marketplace token arm reappeared (reverted 20260806140000)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.triage_src_dedup_review WHERE content_type = 'news') THEN
    RAISE EXCEPTION 'news still visible in triage_src_dedup_review';
  END IF;

  -- The showtime guard is the reason 103 of 217 pairs stop being candidates. A
  -- bare conjunction would be NULL, not false, whenever one side has no source.
  IF position('coalesce(a.source_slug = b.source_slug' in v_src) = 0
     OR position('where not is_showtime' in v_src) = 0 THEN
    RAISE EXCEPTION 'event showtime guard missing from run_dedup_truth_sweep';
  END IF;
  -- The venue_name auto arm is the only reachable one; venue_id is 5.5% populated.
  IF position('despace_same_venue_name_exact_ts' in v_src) = 0 THEN
    RAISE EXCEPTION 'event venue_name auto arm missing from run_dedup_truth_sweep';
  END IF;
END
$verify$;

-- One-shot: retire the showtime pairs a human was never going to resolve.
--
-- The candidate guard above only stops NEW rows. The 50 already sitting open have
-- to be closed here, and 'rejected' is the right state rather than a delete: the
-- sweep's own rejection memory (an admin already said "not a duplicate") reads
-- exactly this, so the decision survives a future widening of the candidate SQL.
-- Body mirrors reject_dedup_review (20260725200000_dedup_review_queue.sql), which
-- cannot be called here because it takes one id at a time and stamps auth.uid().
WITH showtime AS (
  SELECT q.id, q.keep_id, q.drop_id
  FROM public.dedup_review_queue q
  JOIN public.events a ON a.id = q.keep_id
  JOIN public.events b ON b.id = q.drop_id
  JOIN LATERAL (
    SELECT source_slug, source_entity_id FROM public.event_sources
    WHERE event_id = q.keep_id
    ORDER BY is_primary DESC NULLS LAST, first_seen_at LIMIT 1) sa ON true
  JOIN LATERAL (
    SELECT source_slug, source_entity_id FROM public.event_sources
    WHERE event_id = q.drop_id
    ORDER BY is_primary DESC NULLS LAST, first_seen_at LIMIT 1) sb ON true
  WHERE q.entity_type = 'event' AND q.status = 'open'
    AND sa.source_slug = sb.source_slug
    AND sa.source_entity_id IS DISTINCT FROM sb.source_entity_id
    AND a.start_date <> b.start_date
)
UPDATE public.dedup_review_queue q
   SET status = 'rejected',
       reviewed_at = now(),
       reviewer_note = 'separate showtimes of one production: same source, distinct source_entity_id, distinct start time'
  FROM showtime s
 WHERE q.id = s.id;

-- Clear the flag only where no OTHER open dedup row still points at the event.
-- reject_dedup_review clears unconditionally; being narrower here is deliberate,
-- because needs_attention on events has writers outside the dedup queue.
DO $clear$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT e.id
    FROM public.dedup_review_queue q
    JOIN public.events e ON e.id IN (q.keep_id, q.drop_id)
    WHERE q.entity_type = 'event' AND q.status = 'rejected'
      AND q.reviewer_note LIKE 'separate showtimes%'
      AND e.needs_attention
      AND NOT EXISTS (
        SELECT 1 FROM public.dedup_review_queue o
        WHERE o.entity_type = 'event' AND o.status = 'open'
          AND e.id IN (o.keep_id, o.drop_id))
  LOOP
    PERFORM public._dedup_set_needs_attention('event', r.id, false);
  END LOOP;
END
$clear$;

-- One-shot: run the repaired sweep once instead of waiting for 05:50.
-- Expected from the dry run measured against prod: 114 candidates, 30 auto-merged
-- (9 of them historic, invisible before this migration), 15 queued at 0.90,
-- 67 queued at 0.80, 0 capped. Merges go through merge_entities ->
-- _event_merge_core and are reversible via unmerge_entities(audit_id).
DO $sweep$
DECLARE v_res jsonb;
BEGIN
  v_res := public.run_dedup_truth_sweep('event', 'full');
  RAISE NOTICE 'event dedup sweep: %', v_res;
END
$sweep$;