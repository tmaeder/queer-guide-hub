-- Give the city dedup sweep a coordinate arm, so the class it has always been
-- blind to becomes visible work instead of silent corruption.
--
-- THE BLIND SPOT. The city arm keys on dedup_despace(name): same country,
-- identical key, coordinates within 10 km. Correct, and it has merged 153 pairs.
-- But an exonym never shares a key with its counterpart -- 'munich' vs
-- 'munchen', 'venice' vs 'venedig', 'tokyo' vs the Japanese-script row -- so a
-- whole duplicate class was structurally unreachable. Measured on production
-- 2026-09-28: exact, despaced AND unaccent-folded duplicates per country are
-- ZERO, while 249 pairs sit within 2 km of each other, 196 of them after
-- excluding pairs that carry two different Wikidata QIDs. Zero name-key
-- duplicates was never evidence of a clean corpus; it was evidence that the only
-- detector in place could not see this shape.
--
-- THE NEW ARM IS NEVER AUTO-ELIGIBLE, in any mode. is_auto is a hard false, not
-- a threshold that a future confidence tweak could cross, because geographic
-- proximity alone cannot tell a duplicate from a district or an administrative
-- umbrella: Manhattan sits 14 m from New York's centroid, Mestre from Venice's,
-- Grad Zagreb from Zagreb's -- and merging a borough into its city destroys
-- content that cannot be restored. `unmerge_cities` only flips duplicate_of_id;
-- it does NOT undo reparenting, which is why the 29 wrongly merged pairs of
-- 2026-07-29 had to be repaired by hand from surviving evidence. A human decides
-- every pair this arm finds.
--
-- THE ONE HARD EXCLUSION is two distinct non-null wikidata_qids. That is a
-- positive statement that two different real places are involved, and it drops
-- 53 of the 249 pairs -- including Freiberg/Freiburg, 1.24 km apart in the data
-- and ~500 km apart in reality, which is a coordinate defect rather than a
-- duplicate (see the companion suspect-coordinates view). Everything softer than
-- that -- name similarity, shell_status, content counts -- was deliberately left
-- out of the SQL: it belongs in the human's judgement, not in a rule that
-- silently drops candidates.
--
-- Rejected pairs are never re-suggested (the open-pair unique index plus the
-- rejected check in the queue branch), so the district pairs this arm surfaces
-- cost one decision each and then disappear for good. The 200-insert cap per
-- type per run still applies.
--
-- THIS FILE IS BASED ON 20260825110528_dedup_event_arm_venue_name, WHICH IS
-- APPLIED TO PRODUCTION BUT WHOSE FILE IS NOT YET ON MAIN. That migration
-- rewrote the `event` branch (venue-name arm, cross-source substring arm,
-- showtime suppression) from another session. A full CREATE OR REPLACE
-- transcribed from the REPO copy would therefore have silently REVERTED it the
-- moment this migration applied, because this version sorts above it. The base
-- here is the live definition instead: reconstructed, then verified byte-exact
-- against pg_get_functiondef -- 21,078 chars, md5 of the whitespace-normalised
-- body bd3598ce2471b529af3ecbe0a7a85808 on both sides -- which also proved the
-- event branch was the ONLY delta. If that PR changes its event branch before
-- merging, rebase this file on the new definition rather than merging both.
--
-- Only the `when 'city'` branch is this migration's own work: `live` gains
-- wikidata_qid, and the single select becomes a two-arm union, in the same shape
-- the venue branch already uses.

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
