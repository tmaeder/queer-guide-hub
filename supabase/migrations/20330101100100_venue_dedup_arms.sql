-- Venue dedup arms: replace one unreliable gate with several corroborated ones.
--
-- THE STATE THIS FIXES, measured on prod 2026-09-06:
--
--   run_dedup_truth_sweep('venue','dry_run')
--     -> {"would_merge": 0, "would_queue": 480, "skipped": 3}
--
--   admin_automations dedup_truth_sweep: enabled, '50 5 * * *',
--     conditions {"mode":"full",...}, last_run_status 'success',
--     consecutive_failures 0
--
--   dedup_review_queue venue: 530 open, oldest 2026-07-25 (43 days)
--
-- 483 candidate pairs, ZERO auto-eligible, a green cron, and a review queue that
-- has not moved in six weeks. This is the event incident of 20270822093513 one
-- entity later: not a blocked engine, a blind one.
--
-- WHY IT IS BLIND. The auto gate is `both coordinates present AND haversine
-- < 150 m`, applied identically to both arms. On this corpus that is the worst
-- available signal:
--
--   * 2,665 live venues sit on 908 SHARED coordinate points (largest pile 32) --
--     city-centroid fallbacks written when a geocode was missing.
--   * Pairs with byte-identical street addresses measure 507 km (Spartakus,
--     Krakow), 466 km (Sauna Le 9), 423 km (Ganimedes), 42 km (Peninsula Sauna).
--   * Of today's 483 candidates, 398 (82%) have coordinates on BOTH sides that
--     disagree, and only 85 are genuinely missing them -- yet the reason column
--     calls both `despace_no_geo`. A reviewer looking at an 8.5 km pair and a
--     no-coordinates pair is shown the same word for absence of evidence and for
--     evidence against.
--
-- So distance is demoted to a DISPLAY field. It does not gate a merge and it does
-- not veto one either: a pair sharing a street address 466 km apart is a real
-- duplicate, so coordinates may not overrule the address.
--
-- WHAT REPLACES IT COMES FROM READING ROWS. 106 candidate pairs were read by hand
-- across the four new auto arms:
--
--   same_street_address, same city    20/20 genuine
--   same_street_address, cross-city   29/29 genuine
--   shell_absorbed                    24/24 genuine
--   same_domain                       23-24/25 genuine
--   same_phone                         8/8  genuine
--
-- and against the humans' own record: of 69 venue pairs ever decided, 65 approved
-- and 4 rejected. `one side is an empty shell` fires on 35/65 approvals and 0/4
-- rejections. All 4 rejections are pairs where BOTH sides carry a real, DIFFERENT
-- street address (Rapa Nui's two Buenos Aires branches; two GMHC offices). That is
-- the address-conflict veto, derived from the reviewers rather than guessed.
--
-- THE TWO FALSE-POSITIVE CLASSES THE SAMPLES FOUND, and where each is handled:
--
--   1. MULTI-BRANCH / RELOCATED BUSINESS. `Circa` and `Circa Club` in London share
--      circasoho.com but sit at 62 Frith Street and Hungerford House; Silverado
--      Portland appears at its old and new addresses. Both would auto-merge on the
--      domain arm alone. Rung 2 (any identity conflict) sits ABOVE the domain rung,
--      so a differing house number outranks an agreeing domain and the pair drops
--      to review. 19 of today's candidates share a domain and conflict on address.
--
--   2. SINGLE GENERIC CORE TOKEN. dedup_core_tokens strips the city's own name, so
--      "Jessheim Pride" and "Fredrikstad Pride" both reduce to {pride} -- two
--      different Norwegian towns. That pair is in the queue at distance_m = 0 with
--      auto_eligible: true, REJECTED by a human, and it survived only because the
--      mode was queue_only in July. Under today's mode='full' the old
--      `cardinality(core) >= 1` gate merges it. Rung 3 requires >= 2 core tokens
--      and sits above every corroborator rung, so every later rung is implicitly
--      >= 2-token. It also removed both doubtful rows from the shell sample
--      (Le Concorde/La Concorde = {concorde}), taking that arm from 18/20 to 24/24.
--
-- Note `dm = 0` in that pair: identical coordinates are the PLACEHOLDER signature
-- here, not proximity -- the same lesson as the event ladder's midnight rung.
--
-- ONE LADDER. `arm` is chosen once and is_auto / conf / reason are all read off it.
-- The branch being replaced computes reason and confidence as two parallel CASE
-- expressions that re-evaluate the same haversine four times -- exactly the shape
-- that let an earlier event draft emit one reason at two different confidences.
-- Every predicate is coalesce(..., false); the old branch coalesced nothing, so
-- `a.dom = b.dom` was NULL whenever one side had no domain.
--
-- THREE CANDIDATE GENERATORS, and the third is new:
--
--   K1  same city_id + same despaced name
--   K2  same city_id + same core tokens, despaced names differ
--   K3  same country_id + same despaced name, NOT the same city_id
--
-- K3 is recall the old key cannot reach: 912 same-name pairs sit in one country
-- under a different or null city_id. Read by hand, they are city_id MISLINKS --
-- "Bournemouth Saunabar" filed under Brighton, "Kremlin" (96 Donegall Street,
-- Belfast) filed under Brighton, "Gothic Sauna" as both Lugano and Como, plus
-- duplicate city rows (Nimes/Nimes, Moskva/Moskva). It is a candidate generator
-- ONLY: rung 5 catches every cross-city pair that has not already matched on
-- address or place id, so a cross-city pair can NEVER auto-merge on domain, phone
-- or shell. That is deliberate -- crossing a city boundary is precisely where
-- chains live, and the domain arm's two known misses are chains.
--
-- The K3 join uses `not coalesce(a.city_id = b.city_id, false)` rather than
-- `is distinct from`, so a pair with city_id null on BOTH sides is still generated
-- (3,225 live venues have no city_id and `is distinct from` would drop them).
-- It is the exact complement of K1's `a.city_id = b.city_id`, so the generators
-- stay disjoint and no pair is scored twice.
--
-- PROJECTED EFFECT, measured by running this exact ladder as a SELECT on prod:
--   1,403 candidates (483 of them the same set the old key produced, exactly)
--   AUTO  238: same_street_address 145 (54 cross-city), shell_absorbed 62,
--              same_domain 23, same_phone 8, google_place_id 0
--   REVIEW 1,165: cross_city_name_only 626, identity_conflict 377,
--              single_token_core 111, name_key_uncorroborated 51
--
-- The candidate limit rises 800 -> 1200 to match events, because K3 roughly
-- triples the candidate set and a limit that truncates it would make the arms
-- order-dependent.
--
-- ALSO FIXED HERE, in the shared loop rather than the venue branch: the merge
-- branch's `exception when others then v_skipped := v_skipped + 1` swallowed every
-- merge failure into a counter with no error text, so a throwing merge and a
-- skipped candidate were indistinguishable in the run summary. That is one of the
-- ways "green and blind" hides. The counter stays; the first SQLERRM is now
-- returned as `merge_error`.
--
-- With one caveat that reading rows produced: not every throw there is a fault.
-- "Boys Sauna" exists in THREE copies at C/. Luis Braille 1 (once as Gijon, twice
-- as Oviedo), so the run generates all three pairs and the first merge repoints
-- the third row through _venue_merge_core's own dup_children update. The leftover
-- pair then hits that function's 'drop venue already merged' guard and raises --
-- the chain collapsing correctly. Those are counted separately as
-- `chain_skipped` and classified by STATE (is either row now a duplicate?) rather
-- than by matching the guard's message text, which lives in another function and
-- could be reworded. Without that split, the most ordinary multi-copy case in the
-- corpus would report as a merge failure.
--
-- REVERSIBILITY IS A KNOWN, ACCEPTED GAP AT THIS COMMIT. venue_merge_audit has no
-- `details` column, _venue_merge_core records reparenting as COUNTS, and
-- unmerge_venues can only un-hide the dropped row -- every reparented event,
-- review, check-in, trip place and venue_sources row stays on the survivor.
-- 9,567 of 11,070 merged venues have no audit row at all. The events path solved
-- this in 20270822093311 + 20270822093412 (details.moved + schema:1) and venues
-- were never given the same treatment. That is deliberately a separate change;
-- until it lands, 20330101100400 runs the first full pass under a REDUCED merge
-- cap so the blast radius stays hand-auditable.

CREATE OR REPLACE FUNCTION public.run_dedup_truth_sweep(p_type text, p_mode text DEFAULT 'queue_only'::text, p_merge_cap integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $fn$
declare
  r record;
  v_sql text;
  v_keep uuid; v_drop uuid; v_keep_t text; v_drop_t text;
  v_result jsonb; v_audit uuid; v_ins int;
  v_cluster jsonb;
  v_merged int := 0; v_queued int := 0; v_skipped int := 0; v_capped int := 0;
  v_would_merge int := 0; v_would_queue int := 0;
  v_first_error text := null; v_chained int := 0;
  v_queue_cap constant int := 200;
begin
  perform public.assert_admin_or_internal();
  if p_mode not in ('dry_run','queue_only','full') then
    raise exception 'unknown mode %', p_mode;
  end if;

  -- Common candidate shape: a_id, b_id, a_title, b_title, is_auto, conf,
  -- reason, dm (distance), aq/af/ac + bq/bf/bc (canonical ranking inputs).
  v_sql := case p_type
  -- See the migration header for how every rung below was derived and which of
  -- the 106 hand-read pairs it accounts for. Three rules are load-bearing and
  -- easy to undo by accident:
  --   * distance is DISPLAY ONLY. It gates nothing and vetoes nothing.
  --   * rung 3 (>= 2 core tokens) sits above every corroborator rung, so all of
  --     them are implicitly >= 2-token. Moving it down re-opens Jessheim Pride.
  --   * rung 5 (cross-city) sits above domain / phone / shell, so a pair that
  --     crosses a city boundary can only auto-merge on an ADDRESS or a place id.
  --     Moving it down lets a chain auto-merge on its shared domain.
  when 'venue' then $q$
    with live as (
      select v.id, v.name, v.latitude lat, v.longitude lng, v.city, v.city_id, v.country_id,
             public.dedup_despace(v.name) dsp,
             public.dedup_core_tokens(v.name, v.city) core,
             v.website_domain dom,
             nullif(btrim(v.phone_e164),'') ph,
             nullif(v.platform_ids->>'google','') gid,
             public.dedup_house_number(v.address) hn,
             public.dedup_street_key(v.address) st,
             -- "substance": how much of a record this row actually is. A shell is
             -- a row with none of it. Counted, not scored, so the rung is a plain
             -- least(a,b) = 0 rather than a threshold anyone can drift.
             ((coalesce(nullif(btrim(v.address),''),'') <> '')::int
            + (v.website is not null and v.website <> '')::int
            + (coalesce(length(v.description),0) > 60)::int
            + (v.phone is not null and v.phone <> '')::int) subst,
             v.quality_score::numeric q, v.is_featured::boolean f, v.created_at::timestamptz c
      from public.venues v
      where v.duplicate_of_id is null and v.closed_at is null
        and v.review_status is distinct from 'archived'
        and v.data_source is distinct from 'refuge-restrooms'
        and v.name_normalized is not null and length(v.name_normalized) >= 3),
    keys as (
      select a.id a_id, b.id b_id, false cross_city, false weak_name
      from live a join live b on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
      where length(a.dsp) >= 4
      union all
      select a.id, b.id, false, cardinality(a.core) < 2
      from live a join live b on a.city_id = b.city_id and a.id < b.id
        and a.core = b.core and a.dsp <> b.dsp
      where cardinality(a.core) >= 1
      union all
      select a.id, b.id, true, false
      from live a join live b on a.country_id = b.country_id and a.id < b.id
        and a.dsp = b.dsp and not coalesce(a.city_id = b.city_id, false)
      where length(a.dsp) >= 4 and a.country_id is not null),
    pairs as (
      select k.a_id, k.b_id, a.name a_title, b.name b_title,
             coalesce(k.cross_city, false) cross_city,
             coalesce(k.weak_name, false) weak_name,
             coalesce(a.gid is not null and a.gid = b.gid, false) gid_agree,
             -- The leading number is often a postcode, not a house number. That is
             -- safe ONLY because containment is also required: two venues sharing a
             -- postcode have street keys that neither contains the other.
             coalesce(a.hn is not null and b.hn is not null and a.hn = b.hn
                      and length(a.st) >= 6 and length(b.st) >= 6
                      and (position(a.st in b.st) > 0 or position(b.st in a.st) > 0), false) addr_agree,
             coalesce(a.dom is not null and a.dom = b.dom, false) dom_agree,
             coalesce(a.ph is not null and a.ph = b.ph, false) ph_agree,
             coalesce(least(a.subst, b.subst) = 0, false) shell,
             coalesce(a.hn is not null and b.hn is not null and a.hn <> b.hn, false) addr_conflict,
             coalesce(a.dom is not null and b.dom is not null and a.dom <> b.dom, false) dom_conflict,
             coalesce(a.ph is not null and b.ph is not null and a.ph <> b.ph, false) ph_conflict,
             coalesce(a.gid is not null and b.gid is not null and a.gid <> b.gid, false) gid_conflict,
             public.haversine_m(a.lat,a.lng,b.lat,b.lng) dm,
             a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
      from keys k join live a on a.id = k.a_id join live b on b.id = k.b_id),
    armed as (
      select a_id, b_id, a_title, b_title, dm, aq, af, ac, bq, bf, bc,
             case when gid_agree                            then 'google_place_id'
                  when addr_conflict or dom_conflict
                    or ph_conflict or gid_conflict           then 'identity_conflict'
                  when weak_name                             then 'single_token_core'
                  when addr_agree                            then 'same_street_address'
                  when cross_city                            then 'cross_city_name_only'
                  when dom_agree                             then 'same_domain'
                  when ph_agree                              then 'same_phone'
                  when shell                                 then 'shell_absorbed'
                  else 'name_key_uncorroborated' end arm
      from pairs)
    select a_id, b_id, a_title, b_title,
           arm in ('google_place_id','same_street_address','same_domain',
                   'same_phone','shell_absorbed') is_auto,
           case arm when 'google_place_id'     then 0.99
                    when 'same_street_address' then 0.97
                    when 'same_domain'         then 0.95
                    when 'same_phone'          then 0.94
                    when 'shell_absorbed'      then 0.93
                    when 'name_key_uncorroborated' then 0.80
                    else 0.70 end::numeric conf,
           arm reason, dm, aq, af, ac, bq, bf, bc
    from armed
    order by is_auto desc, conf desc limit 1200 $q$
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
      exception when others then
        -- The counter alone made a THROWING merge indistinguishable from a
        -- skipped candidate: both land in v_skipped and the summary reports a
        -- number with no cause. Keep the count, surface the first reason.
        --
        -- But NOT every throw here is a fault. When one venue exists in three
        -- copies -- "Boys Sauna" in Gijon and "Boys-Sauna" twice in Oviedo, all
        -- at C/. Luis Braille 1 -- the run generates all three pairs, and the
        -- first merge repoints the third row via the dup_children update inside
        -- _venue_merge_core. The remaining pair then hits that function's own
        -- guards ('drop venue already merged' / 'keep venue is itself a
        -- duplicate') and raises. That is the chain collapsing CORRECTLY, and
        -- reporting it as a merge failure would cry wolf on the most ordinary
        -- multi-copy case there is.
        --
        -- Classified by STATE, not by matching the message text: the guard
        -- wording lives in another function and a reworded raise would silently
        -- turn every chain collision back into a false alarm.
        --
        -- Scoped to venue rather than made generic. Every merge core raises on an
        -- already-merged row, so the other 11 types have the same latent case, but
        -- a generic check means a dynamic lookup across 12 tables inside an
        -- exception handler. Venue is what this migration measured and what the
        -- capped first pass in 20330101100400 asserts on; the rest keep their
        -- existing behaviour (counted as a skip, reported as merge_error) rather
        -- than getting an untested change smuggled in here.
        v_skipped := v_skipped + 1;
        if p_type = 'venue' and exists (
             select 1 from public.venues
              where id in (v_keep, v_drop) and duplicate_of_id is not null) then
          v_chained := v_chained + 1;
        elsif v_first_error is null then
          v_first_error := left(sqlerrm, 300);
        end if;
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
      -- Venues have the same problem events had: all 4 pairs a human ever rejected
      -- turned on the street address, and the generic payload below does not carry
      -- it. See 20330101100050.
      elsif p_type = 'venue' then
        v_cluster := jsonb_build_object(
          'keep', public._dedup_venue_cluster_side(v_keep),
          'drop', public._dedup_venue_cluster_side(v_drop),
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
    'would_merge', v_would_merge, 'would_queue', v_would_queue,
    'chain_skipped', v_chained, 'merge_error', v_first_error);
end; $fn$;

-- Assert the arms do what this migration exists to do, in BOTH directions.
-- A lower bound alone passes on a rule that merges everything; an upper bound
-- alone passes on the blind engine we are replacing.
DO $verify$
DECLARE v jsonb; v_auto int; v_queue int;
BEGIN
  v := public.run_dedup_truth_sweep('venue', 'dry_run');
  v_auto  := (v->>'would_merge')::int;
  v_queue := (v->>'would_queue')::int;

  IF v_auto IS NULL THEN
    RAISE EXCEPTION 'venue dry run returned no would_merge: %', v;
  END IF;
  IF v_auto = 0 THEN
    RAISE EXCEPTION 'venue auto arms still match nothing (would_merge=0) -- this migration did not fix what it exists to fix';
  END IF;
  -- Measured 238 on 2026-09-06. A large overshoot means a veto is not firing
  -- (most likely the identity-conflict rung, or the cross-city rung slipping
  -- below the domain rung and letting chains through).
  IF v_auto > 600 THEN
    RAISE EXCEPTION 'venue auto arms match % pairs, far above the 238 measured: a veto is not firing', v_auto;
  END IF;
  IF v_queue = 0 THEN
    RAISE EXCEPTION 'venue arms queue nothing at all -- the review path is inert, which is not a state this corpus can be in';
  END IF;

  RAISE NOTICE 'venue arms: would_merge=%, would_queue=%', v_auto, v_queue;
END $verify$;

-- Positive controls for the two vetoes that carry the most risk. A count of zero
-- bad merges also passes on an empty corpus, so assert each veto has live work.
DO $controls$
DECLARE v_conflict int; v_single int; v_cross int;
BEGIN
  WITH live AS (
    SELECT v.id, v.city_id, v.country_id,
           public.dedup_despace(v.name) dsp,
           public.dedup_core_tokens(v.name, v.city) core,
           v.website_domain dom, nullif(btrim(v.phone_e164),'') ph,
           public.dedup_house_number(v.address) hn
      FROM public.venues v
     WHERE v.duplicate_of_id IS NULL AND v.closed_at IS NULL
       AND v.review_status IS DISTINCT FROM 'archived'
       AND v.data_source IS DISTINCT FROM 'refuge-restrooms'
       AND v.name_normalized IS NOT NULL AND length(v.name_normalized) >= 3),
  keys AS (
    SELECT a.id a_id, b.id b_id, false cross_city, false weak_name
      FROM live a JOIN live b ON a.city_id = b.city_id AND a.id < b.id AND a.dsp = b.dsp
     WHERE length(a.dsp) >= 4
    UNION ALL
    SELECT a.id, b.id, false, cardinality(a.core) < 2
      FROM live a JOIN live b ON a.city_id = b.city_id AND a.id < b.id
       AND a.core = b.core AND a.dsp <> b.dsp
     WHERE cardinality(a.core) >= 1
    UNION ALL
    SELECT a.id, b.id, true, false
      FROM live a JOIN live b ON a.country_id = b.country_id AND a.id < b.id
       AND a.dsp = b.dsp AND NOT coalesce(a.city_id = b.city_id, false)
     WHERE length(a.dsp) >= 4 AND a.country_id IS NOT NULL)
  SELECT
    count(*) FILTER (WHERE coalesce(a.hn IS NOT NULL AND b.hn IS NOT NULL AND a.hn <> b.hn, false)
                        OR coalesce(a.dom IS NOT NULL AND b.dom IS NOT NULL AND a.dom <> b.dom, false)
                        OR coalesce(a.ph IS NOT NULL AND b.ph IS NOT NULL AND a.ph <> b.ph, false)),
    count(*) FILTER (WHERE k.weak_name),
    count(*) FILTER (WHERE k.cross_city)
    INTO v_conflict, v_single, v_cross
  FROM keys k JOIN live a ON a.id = k.a_id JOIN live b ON b.id = k.b_id;

  IF v_conflict = 0 THEN
    RAISE EXCEPTION 'identity-conflict veto has zero live work -- it is inert, so "no bad merges" would prove nothing';
  END IF;
  IF v_single = 0 THEN
    RAISE EXCEPTION 'single-token rung has zero live work -- the Jessheim/Fredrikstad Pride class would not be caught';
  END IF;
  IF v_cross = 0 THEN
    RAISE EXCEPTION 'cross-city generator produced nothing -- K3 is not joining';
  END IF;

  RAISE NOTICE 'veto controls live: identity_conflict=%, single_token=%, cross_city=%',
    v_conflict, v_single, v_cross;
END $controls$;
