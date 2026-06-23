-- Unified, accuracy-focused deduplication name keys (2026-06-23)
--
-- Every dedup surface relied on pg_trgm trigram similarity over name_normalized,
-- which fails on the two most common real-world duplicate shapes:
--   1. space/punctuation insertion — 'Lab.Oratory' vs 'Laboratory'
--      (normalize_name -> 'lab oratory' vs 'laboratory', trigram ~0.64)
--   2. token-subset / qualifier suffix — 'Boiler' vs 'BOILER Sauna Berlin'
--      (trigram ~0.37)
--
-- Fix: two cheap deterministic name keys, wired uniformly into the ingest
-- blocker RPCs, the retroactive cluster finders and the nightly sweeps.
--   dedup_despace(t)            -> all [^a-z0-9] removed   ('lab.oratory' = 'laboratory')
--   dedup_core_tokens(t, city)  -> significant tokens, generic + city words dropped
--                                  ('Boiler' = {boiler} = 'BOILER Sauna Berlin')
--
-- Auto-merge stays GEO-CORROBORATED only (user choice): a key match auto-merges
-- only within 150 m; same-key same-city without proximity goes to human review.
-- All merges remain soft + reversible (duplicate_of_id + audit + slug redirect).

-- ===========================================================================
-- 1. Shared deterministic name-key helpers (IMMUTABLE, mirror normalize_name)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.dedup_despace(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public','extensions','pg_catalog' AS $$
  SELECT regexp_replace(lower(extensions.unaccent(coalesce(p,''))), '[^a-z0-9]', '', 'g');
$$;

COMMENT ON FUNCTION public.dedup_despace(text) IS
  'Lowercase + unaccent + strip ALL non-alphanumerics (incl. spaces). Collapses '
  'punctuation/spacing variants: Lab.Oratory = Kit Kat Club style. Dedup key.';

CREATE OR REPLACE FUNCTION public.dedup_core_tokens(p_name text, p_city text DEFAULT NULL)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public','extensions','pg_catalog' AS $$
  SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}'::text[])
  FROM unnest(string_to_array(
         btrim(regexp_replace(lower(extensions.unaccent(coalesce(p_name,''))), '[^a-z0-9]+', ' ', 'g')),
         ' ')) AS t
  WHERE t <> ''
    -- generic articles / conjunctions / venue + category nouns
    AND t <> ALL (ARRAY[
      'the','a','an','and','of','der','die','das','den','dem','des','ein','eine','und',
      'le','la','les','el','los','las','il','lo','un','une','di','da',
      'bar','club','pub','lounge','bistro','sauna','spa','cafe','coffee','kaffee',
      'restaurant','hotel','hostel','inn','disco','disko','nightclub','kino','cinema',
      'shop','store','sex','gay','lgbt','lgbtq','queer','mens','boys'
    ]::text[])
    -- tokens of the city name (so 'BOILER Sauna Berlin' in Berlin -> {boiler})
    AND t <> ALL (coalesce(
      (SELECT array_agg(ct) FROM unnest(string_to_array(
         btrim(regexp_replace(lower(extensions.unaccent(coalesce(p_city,''))), '[^a-z0-9]+', ' ', 'g')),
         ' ')) ct WHERE ct <> ''), '{}'::text[]));
$$;

COMMENT ON FUNCTION public.dedup_core_tokens(text,text) IS
  'Significant sorted-distinct tokens of a name with generic venue/category words '
  'and the city name removed. Equal core tokens at the same place = same entity.';

-- ===========================================================================
-- 2. Functional indexes for the ingest single-row lookups (no table rewrite)
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_venues_city_despace
  ON public.venues (city_id, public.dedup_despace(name)) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_city_core
  ON public.venues (city_id, public.dedup_core_tokens(name, city)) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_venue_despace
  ON public.events (venue_id, public.dedup_despace(title)) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_domain_despace
  ON public.marketplace_listings (merchant_domain, public.dedup_despace(title)) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cities_country_despace
  ON public.cities (country_id, public.dedup_despace(name)) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_personalities_despace
  ON public.personalities (public.dedup_despace(name)) WHERE duplicate_of_id IS NULL;

-- ===========================================================================
-- 3. Ingest blocker RPCs — add despaced_exact + core_token signals
--    (additive UNION branches; RETURNS TABLE signatures unchanged)
-- ===========================================================================

-- 3a. Venues -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_venue_duplicate_candidates(
  p_name text, p_phone_e164 text DEFAULT NULL, p_email text DEFAULT NULL,
  p_website_domain text DEFAULT NULL, p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL,
  p_city_id uuid DEFAULT NULL, p_limit integer DEFAULT 20, p_address text DEFAULT NULL)
RETURNS TABLE(venue_id uuid, match_type text, score numeric, distance_m double precision)
LANGUAGE sql STABLE SET search_path TO 'public','extensions' AS $function$
  WITH p_city AS (
    SELECT c.name FROM public.cities c WHERE p_city_id IS NOT NULL AND c.id = p_city_id
  ),
  candidates AS (
    SELECT v.id AS vid, 'phone_exact'::text AS mt, 1.00::numeric AS sc,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) AS dm
    FROM public.venues v
    WHERE p_phone_e164 IS NOT NULL AND v.phone_e164 = p_phone_e164 AND v.duplicate_of_id IS NULL
    UNION ALL
    SELECT v.id, 'email_exact', 0.98, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_email IS NOT NULL AND v.email_lower = lower(btrim(p_email)) AND v.duplicate_of_id IS NULL
    UNION ALL
    SELECT v.id, 'domain_proximity', 0.95, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_website_domain IS NOT NULL AND v.website_domain = p_website_domain AND v.duplicate_of_id IS NULL
      AND (p_lat IS NULL OR v.latitude IS NULL OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 500)
    UNION ALL
    -- NEW: identical de-spaced name in the same city (Lab.Oratory = Laboratory)
    SELECT v.id, 'despaced_exact', 0.96, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_city_id IS NOT NULL AND v.city_id = p_city_id AND v.duplicate_of_id IS NULL
      AND length(public.dedup_despace(p_name)) >= 4
      AND public.dedup_despace(v.name) = public.dedup_despace(p_name)
    UNION ALL
    -- NEW: identical significant tokens in the same city (Boiler = BOILER Sauna Berlin)
    SELECT v.id, 'core_token', 0.92, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_city_id IS NOT NULL AND v.city_id = p_city_id AND v.duplicate_of_id IS NULL
      AND cardinality(public.dedup_core_tokens(p_name, (SELECT name FROM p_city))) >= 1
      AND public.dedup_core_tokens(v.name, v.city)
          = public.dedup_core_tokens(p_name, (SELECT name FROM p_city))
    UNION ALL
    SELECT v.id, 'name_proximity',
           extensions.similarity(v.name_normalized, public.normalize_name(p_name))::numeric,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE v.name_normalized % public.normalize_name(p_name) AND v.duplicate_of_id IS NULL
      AND (p_city_id IS NULL OR v.city_id = p_city_id)
      AND (p_lat IS NULL OR v.latitude IS NULL OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 1500)
    UNION ALL
    SELECT v.id, 'address_name_proximity',
           ((extensions.similarity(v.address_normalized, public.normalize_address(p_address)) +
             extensions.similarity(v.name_normalized,     public.normalize_name(p_name))) / 2)::numeric,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_address IS NOT NULL
      AND v.address_normalized IS NOT NULL
      AND v.address_normalized % public.normalize_address(p_address)
      AND v.name_normalized    % public.normalize_name(p_name)
      AND v.duplicate_of_id IS NULL
      AND (p_city_id IS NULL OR v.city_id = p_city_id)
  ),
  best AS (
    SELECT DISTINCT ON (vid) vid, mt, sc, dm
    FROM candidates ORDER BY vid, sc DESC, dm ASC NULLS LAST
  )
  SELECT vid, mt, sc, dm FROM best
  ORDER BY sc DESC, dm ASC NULLS LAST
  LIMIT p_limit;
$function$;

-- 3b. Events -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_event_duplicate_candidates(
  p_title text, p_start_date timestamp with time zone, p_venue_id uuid DEFAULT NULL,
  p_city text DEFAULT NULL, p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL,
  p_edition text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE(event_id uuid, match_type text, score numeric, distance_m double precision, time_diff_hours double precision)
LANGUAGE sql STABLE SET search_path TO 'public','extensions','pg_temp' AS $function$
  WITH candidates AS (
    SELECT e.id AS eid, 'venue_date_exact'::text AS mt, 0.98::numeric AS sc,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude) AS dm,
           extract(epoch FROM (e.start_date - p_start_date))/3600.0 AS th
    FROM public.events e
    WHERE p_venue_id IS NOT NULL AND e.venue_id = p_venue_id AND e.duplicate_of_id IS NULL
      AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
      AND extensions.similarity(e.title_normalized, public.normalize_name(p_title)) > 0.35
    UNION ALL
    -- NEW: identical de-spaced title at the same venue within the time window
    SELECT e.id, 'despaced_exact', 0.95,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_venue_id IS NOT NULL AND e.venue_id = p_venue_id AND e.duplicate_of_id IS NULL
      AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
      AND length(public.dedup_despace(p_title)) >= 4
      AND public.dedup_despace(e.title) = public.dedup_despace(p_title)
    UNION ALL
    -- NEW: identical significant tokens at the same venue within the window
    SELECT e.id, 'core_token', 0.90,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_venue_id IS NOT NULL AND e.venue_id = p_venue_id AND e.duplicate_of_id IS NULL
      AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
      AND cardinality(public.dedup_core_tokens(p_title, p_city)) >= 1
      AND public.dedup_core_tokens(e.title, e.city) = public.dedup_core_tokens(p_title, p_city)
    UNION ALL
    SELECT e.id, 'title_city_time',
           extensions.similarity(e.title_normalized, public.normalize_name(p_title))::numeric * 0.95,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_city IS NOT NULL AND lower(e.city) = lower(btrim(p_city)) AND e.duplicate_of_id IS NULL
      AND e.title_normalized % public.normalize_name(p_title)
      AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
    UNION ALL
    SELECT e.id, 'title_geo_time',
           extensions.similarity(e.title_normalized, public.normalize_name(p_title))::numeric * 0.93,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_lat IS NOT NULL AND e.latitude IS NOT NULL AND e.duplicate_of_id IS NULL
      AND e.title_normalized % public.normalize_name(p_title)
      AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
      AND public.haversine_m(p_lat, p_lng, e.latitude, e.longitude) < 2000
    UNION ALL
    SELECT e.id, 'recurring_series', 0.75::numeric,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_edition IS NOT NULL AND e.venue_id = p_venue_id AND e.duplicate_of_id IS NULL
      AND extensions.similarity(e.title_normalized, public.normalize_name(p_title)) > 0.75
      AND abs(extract(epoch FROM (e.start_date - p_start_date))/86400.0) > 7
  ),
  best AS (
    SELECT DISTINCT ON (eid) eid, mt, sc, dm, th
    FROM candidates ORDER BY eid, sc DESC, abs(th) ASC, dm ASC NULLS LAST
  )
  SELECT eid, mt, sc, dm, th FROM best
  ORDER BY sc DESC, abs(th) ASC, dm ASC NULLS LAST
  LIMIT p_limit;
$function$;

-- 3c. Marketplace ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_marketplace_duplicate_candidates(
  p_title text, p_source_slug text DEFAULT NULL, p_source_entity_id text DEFAULT NULL,
  p_merchant_domain text DEFAULT NULL, p_external_url text DEFAULT NULL, p_brand text DEFAULT NULL,
  p_limit integer DEFAULT 10)
RETURNS TABLE(listing_id uuid, matched_title text, match_type text, score numeric, distance_m numeric, time_diff_hours numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $function$
DECLARE
  v_title_norm TEXT := lower(extensions.unaccent(regexp_replace(coalesce(p_title,''), '\s+', ' ', 'g')));
BEGIN
  IF v_title_norm = '' AND p_source_entity_id IS NULL AND p_external_url IS NULL THEN RETURN; END IF;

  IF p_source_slug IS NOT NULL AND p_source_entity_id IS NOT NULL THEN
    RETURN QUERY
      SELECT m.id, m.title, 'source_entity_id'::text, 1.00::numeric, NULL::numeric, NULL::numeric
      FROM public.marketplace_listings m
      WHERE m.source_type = p_source_slug AND m.source_entity_id = p_source_entity_id
      LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_external_url IS NOT NULL AND length(p_external_url) > 10 THEN
    RETURN QUERY
      SELECT m.id, m.title, 'external_url'::text, 0.97::numeric, NULL::numeric, NULL::numeric
      FROM public.marketplace_listings m
      WHERE m.external_url = p_external_url LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_merchant_domain IS NOT NULL THEN
    -- NEW: identical de-spaced title at the same merchant = same product
    RETURN QUERY
      SELECT m.id, m.title, 'despaced_exact'::text, 0.95::numeric, NULL::numeric, NULL::numeric
      FROM public.marketplace_listings m
      WHERE m.merchant_domain = p_merchant_domain AND m.duplicate_of_id IS NULL
        AND length(public.dedup_despace(p_title)) >= 4
        AND public.dedup_despace(m.title) = public.dedup_despace(p_title)
      LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;

    RETURN QUERY
      SELECT m.id, m.title, 'domain_title'::text,
             (0.6 + extensions.similarity(m.title_normalized, v_title_norm) * 0.4)::numeric,
             NULL::numeric, NULL::numeric
      FROM public.marketplace_listings m
      WHERE m.merchant_domain = p_merchant_domain
        AND extensions.similarity(m.title_normalized, v_title_norm) >= 0.70
      ORDER BY extensions.similarity(m.title_normalized, v_title_norm) DESC
      LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_brand IS NOT NULL THEN
    RETURN QUERY
      SELECT m.id, m.title, 'brand_title'::text,
             (extensions.similarity(m.title_normalized, v_title_norm) * 0.85)::numeric,
             NULL::numeric, NULL::numeric
      FROM public.marketplace_listings m
      WHERE m.brand ILIKE p_brand
        AND extensions.similarity(m.title_normalized, v_title_norm) >= 0.85
      ORDER BY extensions.similarity(m.title_normalized, v_title_norm) DESC
      LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  RETURN QUERY
    SELECT m.id, m.title, 'title_trigram'::text,
           (extensions.similarity(m.title_normalized, v_title_norm) * 0.75)::numeric,
           NULL::numeric, NULL::numeric
    FROM public.marketplace_listings m
    WHERE extensions.similarity(m.title_normalized, v_title_norm) >= 0.80
    ORDER BY extensions.similarity(m.title_normalized, v_title_norm) DESC
    LIMIT p_limit;
END;
$function$;

-- 3d. Cities -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_city_duplicate_candidates(
  p_name text, p_country_id uuid DEFAULT NULL, p_lat numeric DEFAULT NULL,
  p_lng numeric DEFAULT NULL, p_limit integer DEFAULT 10)
RETURNS TABLE(city_id uuid, match_type text, score numeric, distance_m double precision)
LANGUAGE sql STABLE SET search_path TO 'public','extensions','pg_catalog' AS $function$
  WITH candidates AS (
    SELECT c.id AS cid, 'name_exact_country'::text AS mt, 0.99::numeric AS sc,
           public.haversine_m(p_lat, p_lng, c.latitude, c.longitude) AS dm
    FROM public.cities c
    WHERE p_country_id IS NOT NULL AND c.country_id = p_country_id
      AND public.normalize_name(c.name) = public.normalize_name(p_name) AND c.duplicate_of_id IS NULL
    UNION ALL
    -- NEW: identical de-spaced name in the same country
    SELECT c.id, 'despaced_exact', 0.97,
           public.haversine_m(p_lat, p_lng, c.latitude, c.longitude)
    FROM public.cities c
    WHERE p_country_id IS NOT NULL AND c.country_id = p_country_id AND c.duplicate_of_id IS NULL
      AND length(public.dedup_despace(p_name)) >= 3
      AND public.dedup_despace(c.name) = public.dedup_despace(p_name)
    UNION ALL
    SELECT c.id, 'name_proximity_country',
           extensions.similarity(c.name_normalized, public.normalize_name(p_name))::numeric,
           public.haversine_m(p_lat, p_lng, c.latitude, c.longitude)
    FROM public.cities c
    WHERE p_country_id IS NOT NULL AND c.country_id = p_country_id
      AND extensions.similarity(c.name_normalized, public.normalize_name(p_name)) > 0.3
      AND c.duplicate_of_id IS NULL
    UNION ALL
    SELECT c.id, 'name_geo_proximity',
           extensions.similarity(c.name_normalized, public.normalize_name(p_name))::numeric,
           public.haversine_m(p_lat, p_lng, c.latitude, c.longitude)
    FROM public.cities c
    WHERE extensions.similarity(c.name_normalized, public.normalize_name(p_name)) > 0.3
      AND c.duplicate_of_id IS NULL
      AND p_lat IS NOT NULL AND c.latitude IS NOT NULL
      AND public.haversine_m(p_lat, p_lng, c.latitude, c.longitude) < 25000
  ),
  best AS (SELECT DISTINCT ON (cid) cid, mt, sc, dm FROM candidates ORDER BY cid, sc DESC, dm ASC NULLS LAST)
  SELECT cid, mt, sc, dm FROM best ORDER BY sc DESC, dm ASC NULLS LAST LIMIT p_limit;
$function$;

-- 3e. Personalities — despaced only, scored BELOW autoMerge (namesake safety) --
CREATE OR REPLACE FUNCTION public.find_personality_duplicate_candidates(
  p_name text, p_wikidata_qid text DEFAULT NULL, p_birth_date date DEFAULT NULL,
  p_external_ids jsonb DEFAULT '{}'::jsonb, p_profession text DEFAULT NULL,
  p_nationality text DEFAULT NULL, p_limit integer DEFAULT 10)
RETURNS TABLE(personality_id uuid, matched_name text, match_type text, score numeric, distance_m numeric, time_diff_hours numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $function$
DECLARE
  v_name_norm TEXT := public.normalize_name(coalesce(p_name,''));
BEGIN
  IF v_name_norm = '' AND p_wikidata_qid IS NULL AND (p_external_ids = '{}'::jsonb OR p_external_ids IS NULL) THEN
    RETURN;
  END IF;

  IF p_wikidata_qid IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id, p.name, 'wikidata_qid'::text, 1.00::numeric, NULL::numeric, NULL::numeric
      FROM public.personalities p WHERE p.wikidata_qid = p_wikidata_qid LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_external_ids IS NOT NULL AND p_external_ids <> '{}'::jsonb THEN
    RETURN QUERY
      SELECT p.id, p.name, 'external_id'::text, 0.95::numeric, NULL::numeric, NULL::numeric
      FROM public.personalities p
      WHERE p.external_ids ?| (SELECT array_agg(k) FROM jsonb_object_keys(p_external_ids) k)
        AND EXISTS (SELECT 1 FROM jsonb_each_text(p_external_ids) e WHERE p.external_ids->>e.key = e.value)
      LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_birth_date IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id, p.name, 'name_dob'::text,
             GREATEST(0.95, extensions.similarity(p.name_normalized, v_name_norm))::numeric,
             NULL::numeric, NULL::numeric
      FROM public.personalities p
      WHERE p.birth_date = p_birth_date
        AND extensions.similarity(p.name_normalized, v_name_norm) >= 0.85
      ORDER BY extensions.similarity(p.name_normalized, v_name_norm) DESC LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- NEW: identical de-spaced name + same birth date is corroborated above;
  -- without a birth date / qid a despaced name match is review-only (0.85 < 0.93).
  RETURN QUERY
    SELECT p.id, p.name, 'despaced_name'::text, 0.85::numeric, NULL::numeric, NULL::numeric
    FROM public.personalities p
    WHERE p.duplicate_of_id IS NULL
      AND length(public.dedup_despace(p_name)) >= 4
      AND public.dedup_despace(p.name) = public.dedup_despace(p_name)
    LIMIT p_limit;
  IF FOUND THEN RETURN; END IF;

  IF p_profession IS NOT NULL OR p_nationality IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id, p.name, 'name_context'::text,
             (extensions.similarity(p.name_normalized, v_name_norm) * 0.9)::numeric,
             NULL::numeric, NULL::numeric
      FROM public.personalities p
      WHERE extensions.similarity(p.name_normalized, v_name_norm) >= 0.88
        AND ((p_profession IS NOT NULL AND p.profession ILIKE '%' || p_profession || '%')
          OR (p_nationality IS NOT NULL AND p.nationality ILIKE '%' || p_nationality || '%'))
      ORDER BY extensions.similarity(p.name_normalized, v_name_norm) DESC LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  RETURN QUERY
    SELECT p.id, p.name, 'name_trigram'::text,
           (extensions.similarity(p.name_normalized, v_name_norm) * 0.8)::numeric,
           NULL::numeric, NULL::numeric
    FROM public.personalities p
    WHERE extensions.similarity(p.name_normalized, v_name_norm) >= 0.75
    ORDER BY extensions.similarity(p.name_normalized, v_name_norm) DESC LIMIT p_limit;
END;
$function$;

-- ===========================================================================
-- 4. Venue retroactive finder + automerge — add despaced + core-token edges
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.find_fuzzy_duplicate_clusters(
  p_limit integer DEFAULT 200, p_min_name_sim numeric DEFAULT 0.80)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
with live as (
  select id, name, name_normalized nn, slug, city, country, city_id,
         latitude lat, longitude lng,
         round(latitude::numeric, 2) clat, round(longitude::numeric, 2) clng,
         round(latitude::numeric, 3) c3lat, round(longitude::numeric, 3) c3lng,
         public.dedup_despace(name) dsp, public.dedup_core_tokens(name, city) core,
         quality_score, is_featured
  from public.venues
  where duplicate_of_id is null and closed_at is null
    and review_status is distinct from 'archived'
    and data_source is distinct from 'refuge-restrooms'
    and name_normalized is not null and length(name_normalized) >= 3
),
-- existing trigram edges
geo_pairs as (
  select a.id aid, b.id bid, extensions.similarity(a.nn, b.nn)::numeric name_sim,
         public.haversine_m(a.lat, a.lng, b.lat, b.lng) dist, 'geo_name'::text mt
  from live a join live b
    on a.clat = b.clat and a.clng = b.clng and a.id < b.id
   and a.lat is not null and b.lat is not null
  where extensions.similarity(a.nn, b.nn) >= p_min_name_sim
),
city_pairs as (
  select a.id aid, b.id bid, extensions.similarity(a.nn, b.nn)::numeric name_sim,
         null::double precision dist, 'city_name'::text mt
  from live a join live b
    on a.city_id is not distinct from b.city_id and a.city_id is not null and a.id < b.id
   and a.nn % b.nn
  where (a.lat is null or b.lat is null)
    and extensions.similarity(a.nn, b.nn) >= greatest(p_min_name_sim, 0.88)
),
-- NEW: identical de-spaced name within the same city (catches Laboratory/Lab.Oratory)
despace_pairs as (
  select a.id aid, b.id bid, 0.97::numeric name_sim,
         public.haversine_m(a.lat, a.lng, b.lat, b.lng) dist, 'despaced'::text mt
  from live a join live b
    on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
  where length(a.dsp) >= 4
),
-- NEW: identical significant tokens within the same city (catches Boiler/BOILER Sauna Berlin)
core_pairs as (
  select a.id aid, b.id bid, 0.93::numeric name_sim,
         public.haversine_m(a.lat, a.lng, b.lat, b.lng) dist, 'core_tokens'::text mt
  from live a join live b
    on a.city_id = b.city_id and a.id < b.id and a.core = b.core
  where cardinality(a.core) >= 1 and a.dsp <> b.dsp
),
-- NEW: one name's tokens are a subset of the other's, only when geo-close
subset_pairs as (
  select a.id aid, b.id bid, 0.85::numeric name_sim,
         public.haversine_m(a.lat, a.lng, b.lat, b.lng) dist, 'core_subset'::text mt
  from live a join live b
    on a.c3lat = b.c3lat and a.c3lng = b.c3lng and a.id < b.id
   and a.lat is not null and b.lat is not null
  where (a.core <@ b.core or b.core <@ a.core) and a.core <> b.core
    and cardinality(a.core) >= 1 and cardinality(b.core) >= 1
    and public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 150
),
edges as (
  select aid, bid,
         max(name_sim) name_sim, min(dist) dist,
         (array_agg(mt order by name_sim desc, dist asc nulls last))[1] mt
  from (select * from geo_pairs union all select * from city_pairs
        union all select * from despace_pairs union all select * from core_pairs
        union all select * from subset_pairs) u
  group by aid, bid
),
ranked as (
  select e.*,
    -- geo-corroborated only: a strong key match <150m, or trigram >=0.92 <100m
    ((e.mt in ('despaced','core_tokens') and e.dist is not null and e.dist < 150)
     or (e.mt = 'geo_name' and e.name_sim >= 0.92 and e.dist is not null and e.dist < 100)) as auto_eligible
  from edges e
  order by auto_eligible desc, name_sim desc, dist asc nulls last
  limit greatest(p_limit, 0)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'score', round(r.name_sim, 3),
  'match_type', r.mt,
  'dist_m', case when r.dist is not null then round(r.dist)::int end,
  'auto_eligible', r.auto_eligible,
  'count', 2,
  'members', jsonb_build_array(
    jsonb_build_object('id', a.id, 'title', a.name, 'slug', a.slug, 'city', a.city, 'country', a.country, 'quality_score', a.quality_score, 'is_featured', a.is_featured),
    jsonb_build_object('id', b.id, 'title', b.name, 'slug', b.slug, 'city', b.city, 'country', b.country, 'quality_score', b.quality_score, 'is_featured', b.is_featured)
  )
) order by r.auto_eligible desc, r.name_sim desc), '[]'::jsonb)
from ranked r
join live a on a.id = r.aid
join live b on b.id = r.bid;
$function$;

CREATE OR REPLACE FUNCTION public.run_venue_fuzzy_automerge(
  p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
declare
  r record; v_keep uuid; v_drop uuid;
  v_merged int := 0; v_skipped int := 0; v_eligible int := 0; v_chains int := 0;
begin
  perform public.assert_admin_or_internal();

  for r in
    with live as (
      select id, name_normalized nn, latitude lat, longitude lng, city, city_id,
             round(latitude::numeric, 2) clat, round(longitude::numeric, 2) clng,
             public.dedup_despace(name) dsp, public.dedup_core_tokens(name, city) core,
             quality_score, is_featured, created_at
      from public.venues
      where duplicate_of_id is null and closed_at is null
        and review_status is distinct from 'archived'
        and data_source is distinct from 'refuge-restrooms'
        and name_normalized is not null and length(name_normalized) >= 3
        and latitude is not null and longitude is not null
    ),
    -- geo-corroborated key matches in the same city, <150 m apart
    key_pairs as (
      select a.id aid, b.id bid,
             a.quality_score aq, a.is_featured af, a.created_at ac,
             b.quality_score bq, b.is_featured bf, b.created_at bc
      from live a join live b
        on a.city_id = b.city_id and a.city_id is not null and a.id < b.id
      where public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 150
        and ( (length(a.dsp) >= 4 and a.dsp = b.dsp)
              or (cardinality(a.core) >= 1 and a.core = b.core) )
    ),
    -- existing trigram rule (same coords bucket, ≥0.92, <100 m)
    tri_pairs as (
      select a.id aid, b.id bid,
             a.quality_score aq, a.is_featured af, a.created_at ac,
             b.quality_score bq, b.is_featured bf, b.created_at bc
      from live a join live b
        on a.clat = b.clat and a.clng = b.clng and a.id < b.id
      where extensions.similarity(a.nn, b.nn) >= 0.92
        and public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 100
    ),
    pairs as (
      select distinct on (aid, bid) aid, bid, aq, af, ac, bq, bf, bc
      from (select * from key_pairs union all select * from tri_pairs) u
    )
    select * from pairs limit greatest(p_limit, 0)
  loop
    v_eligible := v_eligible + 1;
    -- canonical = higher quality_score, then featured, then older
    if (coalesce(r.aq, -1) >  coalesce(r.bq, -1))
       or (coalesce(r.aq, -1) = coalesce(r.bq, -1) and coalesce(r.af, false) and not coalesce(r.bf, false))
       or (coalesce(r.aq, -1) = coalesce(r.bq, -1) and coalesce(r.af, false) = coalesce(r.bf, false) and r.ac <= r.bc)
    then v_keep := r.aid; v_drop := r.bid;
    else v_keep := r.bid; v_drop := r.aid; end if;

    if p_dry_run then v_merged := v_merged + 1; continue; end if;

    begin
      perform public._venue_merge_core(v_keep, v_drop, null);
      v_merged := v_merged + 1;
    exception when others then v_skipped := v_skipped + 1;
    end;
  end loop;

  if not p_dry_run then v_chains := public.collapse_venue_dup_chains(); end if;

  return jsonb_build_object('dry_run', p_dry_run, 'eligible_pairs', v_eligible,
    'merged', v_merged, 'skipped', v_skipped, 'chains_collapsed', v_chains);
end; $function$;

-- ===========================================================================
-- 5. Event + Marketplace retroactive finders (multi-type admin fuzzy view)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.find_event_fuzzy_duplicate_clusters(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
with live as (
  select id, title, title_normalized nt, slug, city, country, venue_id, start_date,
         public.dedup_despace(title) dsp, public.dedup_core_tokens(title, city) core,
         quality_score, is_featured
  from public.events
  where duplicate_of_id is null and coalesce(status,'') <> 'archived'
    and venue_id is not null and start_date is not null
    and title_normalized is not null and length(title_normalized) >= 3
),
pairs as (
  select a.id aid, b.id bid,
    case when length(a.dsp) >= 4 and a.dsp = b.dsp then 0.97
         when cardinality(a.core) >= 1 and a.core = b.core then 0.93
         else extensions.similarity(a.nt, b.nt) end::numeric name_sim,
    (length(a.dsp) >= 4 and a.dsp = b.dsp) or (cardinality(a.core) >= 1 and a.core = b.core) as key_eq
  from live a join live b
    on a.venue_id = b.venue_id and a.id < b.id
   and abs(extract(epoch from (a.start_date - b.start_date))) < 48*3600
  where (length(a.dsp) >= 4 and a.dsp = b.dsp)
     or (cardinality(a.core) >= 1 and a.core = b.core)
     or extensions.similarity(a.nt, b.nt) >= 0.88
),
ranked as (
  select * from pairs order by key_eq desc, name_sim desc limit greatest(p_limit, 0)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'score', round(r.name_sim, 3),
  'match_type', case when r.key_eq then 'same_venue_key' else 'same_venue_title' end,
  'dist_m', null,
  'auto_eligible', r.key_eq,
  'count', 2,
  'members', jsonb_build_array(
    jsonb_build_object('id', a.id, 'title', a.title, 'slug', a.slug, 'city', a.city, 'country', a.country, 'quality_score', a.quality_score, 'is_featured', a.is_featured),
    jsonb_build_object('id', b.id, 'title', b.title, 'slug', b.slug, 'city', b.city, 'country', b.country, 'quality_score', b.quality_score, 'is_featured', b.is_featured)
  )
) order by r.key_eq desc, r.name_sim desc), '[]'::jsonb)
from ranked r join live a on a.id = r.aid join live b on b.id = r.bid;
$function$;

CREATE OR REPLACE FUNCTION public.find_marketplace_fuzzy_duplicate_clusters(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
with live as (
  select id, title, title_normalized nt, slug, merchant_domain,
         public.dedup_despace(title) dsp, public.dedup_core_tokens(title, null) core,
         quality_score
  from public.marketplace_listings
  where duplicate_of_id is null and status = 'active'
    and merchant_domain is not null
    and title_normalized is not null and length(title_normalized) >= 3
),
pairs as (
  select a.id aid, b.id bid,
    case when length(a.dsp) >= 4 and a.dsp = b.dsp then 0.97
         when cardinality(a.core) >= 1 and a.core = b.core then 0.90
         else extensions.similarity(a.nt, b.nt) end::numeric name_sim,
    (length(a.dsp) >= 4 and a.dsp = b.dsp) as despaced_eq
  from live a join live b
    on a.merchant_domain = b.merchant_domain and a.id < b.id
  where (length(a.dsp) >= 4 and a.dsp = b.dsp)
     or (cardinality(a.core) >= 1 and a.core = b.core)
     or extensions.similarity(a.nt, b.nt) >= 0.90
),
ranked as (
  select * from pairs order by despaced_eq desc, name_sim desc limit greatest(p_limit, 0)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'score', round(r.name_sim, 3),
  'match_type', case when r.despaced_eq then 'same_merchant_key' else 'same_merchant_title' end,
  'dist_m', null,
  'auto_eligible', r.despaced_eq,
  'count', 2,
  'members', jsonb_build_array(
    jsonb_build_object('id', a.id, 'title', a.title, 'slug', a.slug, 'city', null, 'country', null, 'quality_score', a.quality_score, 'is_featured', null),
    jsonb_build_object('id', b.id, 'title', b.title, 'slug', b.slug, 'city', null, 'country', null, 'quality_score', b.quality_score, 'is_featured', null)
  )
) order by r.despaced_eq desc, r.name_sim desc), '[]'::jsonb)
from ranked r join live a on a.id = r.aid join live b on b.id = r.bid;
$function$;

-- ===========================================================================
-- 6. Broaden nightly sweeps to act on the new keys (geo / venue / domain bound)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.run_event_dedup_sweep(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
declare r record; v_keep uuid; v_drop uuid; v_merged int:=0; v_skipped int:=0; v_eligible int:=0; v_chains int:=0;
begin
  perform public.assert_admin_or_internal();
  for r in
    with live as (
      select id, venue_id, title_normalized nt, city, start_date, quality_score, is_featured, created_at,
             public.dedup_despace(title) dsp, public.dedup_core_tokens(title, city) core
      from public.events
      where duplicate_of_id is null and coalesce(status,'') <> 'archived'
        and venue_id is not null and start_date is not null
        and title_normalized is not null and length(title_normalized) >= 3
    )
    select a.id aid, b.id bid, a.quality_score aq, a.is_featured af, a.created_at ac,
           b.quality_score bq, b.is_featured bf, b.created_at bc
    from live a join live b
      on a.venue_id = b.venue_id and a.id < b.id
     and abs(extract(epoch from (a.start_date - b.start_date))) < 48*3600
    where extensions.similarity(a.nt, b.nt) >= 0.92
       or (length(a.dsp) >= 4 and a.dsp = b.dsp)
       or (cardinality(a.core) >= 1 and a.core = b.core)
    limit greatest(p_limit, 0)
  loop
    v_eligible := v_eligible + 1;
    if (coalesce(r.aq,-1) >  coalesce(r.bq,-1))
       or (coalesce(r.aq,-1) = coalesce(r.bq,-1) and coalesce(r.af,false) and not coalesce(r.bf,false))
       or (coalesce(r.aq,-1) = coalesce(r.bq,-1) and coalesce(r.af,false) = coalesce(r.bf,false) and r.ac <= r.bc)
    then v_keep := r.aid; v_drop := r.bid; else v_keep := r.bid; v_drop := r.aid; end if;
    if p_dry_run then v_merged := v_merged + 1; continue; end if;
    begin
      perform public._event_merge_core(v_keep, v_drop, null);
      v_merged := v_merged + 1;
    exception when others then v_skipped := v_skipped + 1;
    end;
  end loop;
  if not p_dry_run then v_chains := public.collapse_entity_dup_chains('event'); end if;
  return jsonb_build_object('dry_run', p_dry_run, 'eligible_pairs', v_eligible, 'merged', v_merged, 'skipped', v_skipped, 'chains_collapsed', v_chains);
end; $function$;

CREATE OR REPLACE FUNCTION public.run_marketplace_dedup_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
declare r record; v_n int := 0;
begin
  -- Exact (title_normalized, merchant_domain) winner-take-all, as before.
  for r in
    with ranked as (
      select id,
        first_value(id) over (partition by title_normalized, merchant_domain
          order by (affiliate_url is not null) desc, (link_health in ('ok','redirect')) desc,
                   quality_score desc nulls last, views_count desc nulls last, created_at desc) keep_id,
        row_number() over (partition by title_normalized, merchant_domain
          order by (affiliate_url is not null) desc, (link_health in ('ok','redirect')) desc,
                   quality_score desc nulls last, views_count desc nulls last, created_at desc) rn
      from public.marketplace_listings
      where status = 'active' and duplicate_of_id is null
        and title_normalized is not null and title_normalized <> '' and merchant_domain is not null
    )
    select id, keep_id from ranked where rn > 1 limit 2000
  loop
    begin perform public._marketplace_merge_core(r.keep_id, r.id, null); v_n := v_n + 1;
    exception when others then null; end;
  end loop;

  -- NEW: identical de-spaced title at the same merchant (catches punctuation/spacing variants).
  for r in
    with ranked as (
      select id,
        first_value(id) over (partition by public.dedup_despace(title), merchant_domain
          order by (affiliate_url is not null) desc, (link_health in ('ok','redirect')) desc,
                   quality_score desc nulls last, views_count desc nulls last, created_at desc) keep_id,
        row_number() over (partition by public.dedup_despace(title), merchant_domain
          order by (affiliate_url is not null) desc, (link_health in ('ok','redirect')) desc,
                   quality_score desc nulls last, views_count desc nulls last, created_at desc) rn
      from public.marketplace_listings
      where status = 'active' and duplicate_of_id is null
        and merchant_domain is not null and length(public.dedup_despace(title)) >= 4
    )
    select id, keep_id from ranked where rn > 1 limit 2000
  loop
    begin perform public._marketplace_merge_core(r.keep_id, r.id, null); v_n := v_n + 1;
    exception when others then null; end;
  end loop;

  perform public.collapse_entity_dup_chains('marketplace');
  return v_n;
end; $function$;

-- ===========================================================================
-- 7. Grants (match existing surface)
-- ===========================================================================
GRANT EXECUTE ON FUNCTION public.dedup_despace(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dedup_core_tokens(text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.find_event_fuzzy_duplicate_clusters(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_marketplace_fuzzy_duplicate_clusters(integer) TO authenticated;
