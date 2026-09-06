-- Prevent venue duplicates at ingest instead of merging them the next night, and
-- close the country hole that let a Berlin venue merge into an Osaka one.
--
-- THREE OF THE SEVEN BRANCHES OF find_venue_duplicate_candidates ARE DEAD AT
-- INGEST, and have been since 20260623150504 created two of them. The caller,
-- supabase/functions/pipeline-deduplicate/index.ts, builds its args as:
--
--     p_city_id: null,          <- hardcoded literal
--     ...                        <- p_address never passed at all
--
-- so `despaced_exact` (0.96) and `core_token` (0.92) -- both gated on
-- `p_city_id IS NOT NULL` -- and `address_name_proximity` (gated on
-- `p_address IS NOT NULL`) can never fire, and the functional indexes
-- idx_venues_city_despace / idx_venues_city_core / idx_venues_address_trgm are
-- never used by the path they were built for. The exact duplicate shapes that
-- migration exists to catch ("Lab.Oratory" vs "Laboratory", "Boiler" vs "BOILER
-- Sauna Berlin") are caught retroactively by the nightly sweep and not at ingest.
--
-- The staging rows cannot supply a city_id: measured across the last 60 days,
-- 8,161 venue staging rows carry `location.city` (8,081) and `location.address`
-- (8,016) and `city_id` on exactly ZERO of them. So the fix cannot be "pass the
-- id the caller already has" -- it has to be a text-keyed path, and text is
-- exactly where the danger is.
--
-- CITY TEXT MAY NEVER AUTO-MERGE, and that is the load-bearing decision here.
-- `cities` holds at most one row per (name, country), so Portland ME and Portland
-- OR are not distinguishable by name -- the collision that mislinked 116 events
-- in 20260802090844. A name-keyed match on city TEXT is therefore evidence, not
-- proof: the two new branches score 0.88, deliberately BELOW the 0.90 auto bar in
-- _shared/dedup-engine.ts, so they always route to review unless phone, email,
-- domain or address independently lifts the fused score over 0.90 through the
-- existing confirmWeight arithmetic. Nothing about the auto threshold changes.
--
-- `address_exact` (0.97) DOES auto-merge, because a house number plus a street is
-- proof of place rather than a name coincidence, and it is the same comparator the
-- nightly arms use -- 20/20 same-city and 29/29 cross-city on hand-read samples
-- (see 20330101100000). It requires the name key to agree as well, so it can never
-- merge two different businesses that share a building.
--
-- THE COUNTRY VETO closes a hole that is not hypothetical. Measured 2026-08-22
-- while importing 148 Berlin venues: a staged venue named "Village"
-- (Kurfurstenstrasse 31-32, 10785 Berlin, with coordinates and country DE)
-- matched an existing "Village" in OSAKA at dedup_match_score 1.000, on the name
-- alone. Nothing errored, because commit_venue_staging_item's UPDATE branch is
-- fill-the-gaps -- the Japanese row simply acquired Berlin's address, coordinates
-- and website into its empty columns while keeping city Osaka and its Japanese
-- postcode. 1 of 148 rows; luck, not design, kept it to one.
--
-- The engine could not have vetoed it: venues carry `guards: [geoGuard(250)]`, and
-- haversine_m returns NULL when either side lacks coordinates, so a
-- coordinate-less pair gets NO veto at all.
--
-- The veto lives in the RPC's WHERE clauses rather than as a new TS guard on
-- purpose. A guard needs the candidate's country on the result, which means a new
-- column on RETURNS TABLE, which means DROP + CREATE plus updating
-- find_hotel_duplicate_candidates, which delegates here. Filtering at the source
-- is smaller, and a candidate in the wrong country is not a conflict to record --
-- it is not a candidate.
--
-- It resolves through public.resolve_country_from_text(country, city), NOT through
-- `upper(code) = upper(country)`. Two dozen US-state and CA-province abbreviations
-- are also valid ISO country codes, and a bare comparison produced Agawam MA ->
-- Morocco, Sturgis SD -> Sudan, Tuscaloosa AL -> Albania (20260807100200). That
-- resolver demands city corroboration for ambiguous codes and returns NULL rather
-- than guessing -- so an unresolvable country disables the veto instead of
-- applying a wrong one. FAIL-OPEN, deliberately: a missed veto is a duplicate to
-- clean up, a wrong veto is a duplicate we can never see again.
--
-- SIGNATURE CHANGE. The new parameters are appended with defaults, but the OLD
-- 9-arg signature must be DROPPED rather than left alongside: PostgREST resolves
-- overloads BY ARGUMENT NAME, and a call naming only the original nine would be
-- ambiguous between two candidates (42725) rather than picking the newer one.
-- find_hotel_duplicate_candidates calls this POSITIONALLY with those nine
-- arguments in order, so appending keeps that call binding without a change there.

DROP FUNCTION IF EXISTS public.find_venue_duplicate_candidates(
  text, text, text, text, numeric, numeric, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.find_venue_duplicate_candidates(
  p_name text,
  p_phone_e164 text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text,
  p_website_domain text DEFAULT NULL::text,
  p_lat numeric DEFAULT NULL::numeric,
  p_lng numeric DEFAULT NULL::numeric,
  p_city_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 20,
  p_address text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text,
  p_country text DEFAULT NULL::text)
 RETURNS TABLE(venue_id uuid, match_type text, score numeric, distance_m double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH ctx AS (
    SELECT
      -- The city NAME, whether it came as an id or as free text. dedup_core_tokens
      -- needs it to strip the city's own words out of the venue name.
      coalesce(
        (SELECT c.name FROM public.cities c WHERE p_city_id IS NOT NULL AND c.id = p_city_id),
        nullif(btrim(p_city), '')) AS cname,
      -- NULL when the country cannot be resolved without guessing, which disables
      -- the veto rather than applying a wrong one.
      public.resolve_country_from_text(p_country, p_city) AS cid,
      public.dedup_house_number(p_address) AS hn,
      public.dedup_street_key(p_address)   AS st
  ),
  candidates AS (
    SELECT v.id AS vid, 'phone_exact'::text AS mt, 1.00::numeric AS sc,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) AS dm
    FROM public.venues v, ctx
    WHERE p_phone_e164 IS NOT NULL AND v.phone_e164 = p_phone_e164 AND v.duplicate_of_id IS NULL
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
    UNION ALL
    SELECT v.id, 'email_exact', 0.98, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v, ctx
    WHERE p_email IS NOT NULL AND v.email_lower = lower(btrim(p_email)) AND v.duplicate_of_id IS NULL
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
    UNION ALL
    SELECT v.id, 'domain_proximity', 0.95, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v, ctx
    WHERE p_website_domain IS NOT NULL AND v.website_domain = p_website_domain AND v.duplicate_of_id IS NULL
      AND (p_lat IS NULL OR v.latitude IS NULL OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 500)
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
    UNION ALL
    -- NEW: house number + street containment + an agreeing name key. The address is
    -- proof of place; the name key is what stops two businesses in one building
    -- merging. Same comparator as the nightly arms (20330101100100).
    SELECT v.id, 'address_exact', 0.97, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v, ctx
    WHERE p_address IS NOT NULL AND v.duplicate_of_id IS NULL
      AND ctx.hn IS NOT NULL AND public.dedup_house_number(v.address) = ctx.hn
      AND length(ctx.st) >= 6 AND length(public.dedup_street_key(v.address)) >= 6
      AND (position(ctx.st in public.dedup_street_key(v.address)) > 0
        OR position(public.dedup_street_key(v.address) in ctx.st) > 0)
      AND (public.dedup_despace(v.name) = public.dedup_despace(p_name)
        OR (cardinality(public.dedup_core_tokens(p_name, ctx.cname)) >= 2
            AND public.dedup_core_tokens(v.name, v.city)
                = public.dedup_core_tokens(p_name, ctx.cname)))
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
    UNION ALL
    SELECT v.id, 'despaced_exact', 0.96, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v, ctx
    WHERE p_city_id IS NOT NULL AND v.city_id = p_city_id AND v.duplicate_of_id IS NULL
      AND length(public.dedup_despace(p_name)) >= 4
      AND public.dedup_despace(v.name) = public.dedup_despace(p_name)
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
    UNION ALL
    SELECT v.id, 'core_token', 0.92, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v, ctx
    WHERE p_city_id IS NOT NULL AND v.city_id = p_city_id AND v.duplicate_of_id IS NULL
      AND cardinality(public.dedup_core_tokens(p_name, ctx.cname)) >= 1
      AND public.dedup_core_tokens(v.name, v.city)
          = public.dedup_core_tokens(p_name, ctx.cname)
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
    UNION ALL
    -- NEW: the same two name keys, reachable when the caller has only city TEXT.
    -- 0.88 is BELOW the 0.90 auto bar on purpose -- see the header. Never raise
    -- these to 0.90+ without solving same-name cities first.
    SELECT v.id, 'despaced_city_text', 0.88, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v, ctx
    WHERE p_city_id IS NULL AND ctx.cname IS NOT NULL AND v.duplicate_of_id IS NULL
      AND public.dedup_despace(v.city) = public.dedup_despace(ctx.cname)
      AND length(public.dedup_despace(p_name)) >= 4
      AND public.dedup_despace(v.name) = public.dedup_despace(p_name)
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
    UNION ALL
    SELECT v.id, 'core_token_city_text', 0.88, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v, ctx
    WHERE p_city_id IS NULL AND ctx.cname IS NOT NULL AND v.duplicate_of_id IS NULL
      AND public.dedup_despace(v.city) = public.dedup_despace(ctx.cname)
      -- >= 2 tokens, not >= 1: a single generic core token is the
      -- "Jessheim Pride" = "Fredrikstad Pride" = {pride} class.
      AND cardinality(public.dedup_core_tokens(p_name, ctx.cname)) >= 2
      AND public.dedup_core_tokens(v.name, v.city)
          = public.dedup_core_tokens(p_name, ctx.cname)
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
    UNION ALL
    SELECT v.id, 'name_proximity',
           extensions.similarity(v.name_normalized, public.normalize_name(p_name))::numeric,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v, ctx
    WHERE v.name_normalized % public.normalize_name(p_name) AND v.duplicate_of_id IS NULL
      AND (p_city_id IS NULL OR v.city_id = p_city_id)
      AND (p_lat IS NULL OR v.latitude IS NULL OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 1500)
      -- This is the branch that merged Berlin's "Village" into Osaka's: trigram
      -- name similarity with no geographic gate whenever either side lacks
      -- coordinates. The country veto is what closes it.
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
    UNION ALL
    SELECT v.id, 'address_name_proximity',
           ((extensions.similarity(v.address_normalized, public.normalize_address(p_address)) +
             extensions.similarity(v.name_normalized,     public.normalize_name(p_name))) / 2)::numeric,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v, ctx
    WHERE p_address IS NOT NULL AND v.address_normalized IS NOT NULL
      AND v.address_normalized % public.normalize_address(p_address)
      AND v.name_normalized    % public.normalize_name(p_name)
      AND v.duplicate_of_id IS NULL
      AND (p_city_id IS NULL OR v.city_id = p_city_id)
      AND (ctx.cid IS NULL OR v.country_id IS NULL OR v.country_id = ctx.cid)
  ),
  best AS (
    SELECT DISTINCT ON (vid) vid, mt, sc, dm
    FROM candidates ORDER BY vid, sc DESC, dm ASC NULLS LAST
  )
  SELECT vid, mt, sc, dm FROM best
  ORDER BY sc DESC, dm ASC NULLS LAST
  LIMIT p_limit;
$function$;

REVOKE ALL ON FUNCTION public.find_venue_duplicate_candidates(
  text, text, text, text, numeric, numeric, uuid, integer, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_venue_duplicate_candidates(
  text, text, text, text, numeric, numeric, uuid, integer, text, text, text)
  TO authenticated, service_role;

DO $verify$
DECLARE
  v_overloads int; v_de uuid; v_jp uuid;
  v_city text; v_name text; v_addr text; v_hits int; v_cross int;
BEGIN
  -- Exactly one signature, or PostgREST answers a named call with 42725.
  SELECT count(*) INTO v_overloads
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'find_venue_duplicate_candidates';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'find_venue_duplicate_candidates has % signatures -- a named call would be ambiguous', v_overloads;
  END IF;

  -- The hotel wrapper calls this positionally with the original nine arguments.
  -- If appending broke that binding, hotel dedup silently stops finding venues.
  PERFORM public.find_hotel_duplicate_candidates('probe', NULL, NULL, NULL, NULL, NULL,
                                                 NULL, '{}'::jsonb, NULL, 1, NULL);

  -- POSITIVE CONTROL, not just "no bad matches". Take a real venue that has an
  -- address and a city, and prove the new text-keyed path finds ITSELF -- an
  -- assertion of zero cross-country hits would also pass on a function that
  -- returns nothing at all.
  SELECT v.name, v.city, v.address INTO v_name, v_city, v_addr
    FROM public.venues v
   WHERE v.duplicate_of_id IS NULL AND v.city IS NOT NULL
     AND v.address <> '' AND public.dedup_house_number(v.address) IS NOT NULL
     AND length(public.dedup_street_key(v.address)) >= 6
     AND length(public.dedup_despace(v.name)) >= 4
   LIMIT 1;
  IF v_name IS NULL THEN RAISE EXCEPTION 'no probe venue available'; END IF;

  SELECT count(*) INTO v_hits FROM public.find_venue_duplicate_candidates(
    p_name => v_name, p_city => v_city, p_address => v_addr, p_limit => 20);
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'the city-text path found nothing for a venue that exists (% in %) -- it is inert', v_name, v_city;
  END IF;

  -- NEGATIVE CONTROL: the Berlin/Osaka "Village" shape. A German venue name,
  -- German country text, no coordinates -- no Japanese venue may come back.
  SELECT id INTO v_de FROM public.countries WHERE code = 'DE';
  SELECT id INTO v_jp FROM public.countries WHERE code = 'JP';
  IF v_de IS NULL OR v_jp IS NULL THEN RAISE EXCEPTION 'DE/JP missing from countries'; END IF;

  SELECT count(*) INTO v_cross
    FROM public.find_venue_duplicate_candidates(
           p_name => 'Village', p_city => 'Berlin', p_country => 'DE', p_limit => 50) c
    JOIN public.venues v ON v.id = c.venue_id
   WHERE v.country_id = v_jp;
  IF v_cross > 0 THEN
    RAISE EXCEPTION 'country veto is not firing: % Japanese venue(s) returned for a Berlin query', v_cross;
  END IF;

  RAISE NOTICE 'ingest blocker: 1 signature, hotel wrapper binds, city-text path returned % hits, country veto clean', v_hits;
END $verify$;
