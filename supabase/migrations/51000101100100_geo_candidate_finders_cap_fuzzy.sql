-- Ingest-side geographic dedup: a fuzzy name match may never authorise a merge.
--
-- `find_city_duplicate_candidates` / `find_country_duplicate_candidates` feed
-- `_shared/dedup-engine.ts` on the ingest path, which is LIVE for these types
-- (1,000 `cities` and 250 `countries` staging rows, newest 2026-09-13). Both
-- carried a trigram arm scoring `similarity(...)` straight through as the
-- candidate score, and the engine auto-merges a city at fused >= 0.92 and a
-- country at >= 0.95. So a resemblance between two DIFFERENT place names could
-- merge them with no human and no gazetteer.
--
-- TRIGRAM SIMILARITY IS WORD-ORDER BLIND, so a high score is not evidence that
-- two names are the same name. Measured on the live corpus:
--   "Berlin-Rixdorf"   vs "Rixdorf, Berlin"      1.000   (same place, by luck)
--   "Burg, Magdeburg"  vs "Magdeburg"            0.833   DIFFERENT towns, ~25 km
--   "Itapetinga"       vs "Itapetininga"         0.846   DIFFERENT cities, Bahia
--                                                        vs Sao Paulo, ~1,400 km
--   "18th arrondissement of Paris" vs "14th ..."  0.813  DIFFERENT districts
-- Only the accident that those land at 0.81-0.85 rather than 0.92 keeps them out
-- of the auto path today. That is not a safety property, it is a coincidence.
--
-- FIX: the exact arms (`name_exact_country`, `despaced_exact`, `code_exact`,
-- `name_exact`) keep their scores -- an identical name key, or an ISO code, is
-- identity and auto is right. The fuzzy arms are CAPPED strictly below what the
-- engine can turn into an auto-merge, so they can still raise a human review and
-- can never do more than that.
--
-- The city cap is 0.86 and the arithmetic is load-bearing: the engine's
-- confirm-lift is `fused = detMax + confirmWeight * semCosine` with
-- confirmWeight 0.05 and autoMerge 0.92, so a naive cap at the review ceiling
-- would still reach 0.92 once an embedding agreed. 0.86 + 0.05*1.0 = 0.91 < 0.92.
-- Country semantic is disabled (confirmWeight 0) against autoMerge 0.95, so the
-- same 0.86 is clear there. 0.86 is used rather than a looser 0.90 because 0.90
-- CANNOT BIND: the highest trigram score reachable between two non-identical
-- country names in this corpus is 0.889 ("Central African Republicc"), so a 0.90
-- cap would be untestable decoration. 0.86 still sits above the 0.85 country
-- review bar, so nothing that could previously raise a review loses that.
--
-- COUNTRY ALSO GAINS AN ISO VETO. A country's identity is its ISO 3166-1 alpha-2
-- code. The name arms previously fired regardless of a disagreeing code, so a
-- staging row could be matched by resemblance onto a country its own code says it
-- is not. The closest live pair is Republic of the Congo (CG) vs Democratic
-- Republic of the Congo (CD) at 0.688 -- under threshold today, which is why this
-- is a mechanism fix rather than a data repair.

CREATE OR REPLACE FUNCTION public.find_city_duplicate_candidates(
  p_name text,
  p_country_id uuid DEFAULT NULL::uuid,
  p_lat numeric DEFAULT NULL::numeric,
  p_lng numeric DEFAULT NULL::numeric,
  p_limit integer DEFAULT 10)
 RETURNS TABLE(city_id uuid, match_type text, score numeric, distance_m double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
  WITH candidates AS (
    -- identity: an exact name key in a known country
    SELECT c.id AS cid, 'name_exact_country'::text AS mt, 0.99::numeric AS sc,
           public.haversine_m(p_lat, p_lng, c.latitude, c.longitude) AS dm
    FROM public.cities c
    WHERE p_country_id IS NOT NULL AND c.country_id = p_country_id
      AND public.normalize_name(c.name) = public.normalize_name(p_name) AND c.duplicate_of_id IS NULL
    UNION ALL
    SELECT c.id, 'despaced_exact', 0.97,
           public.haversine_m(p_lat, p_lng, c.latitude, c.longitude)
    FROM public.cities c
    WHERE p_country_id IS NOT NULL AND c.country_id = p_country_id AND c.duplicate_of_id IS NULL
      AND length(public.dedup_despace(p_name)) >= 3
      AND public.dedup_despace(c.name) = public.dedup_despace(p_name)
    UNION ALL
    -- resemblance: review only. Capped at 0.86 so that even a fully agreeing
    -- embedding (0.86 + 0.05 = 0.91) stays under the 0.92 auto-merge bar.
    SELECT c.id, 'name_proximity_country',
           least(extensions.similarity(c.name_normalized, public.normalize_name(p_name))::numeric, 0.86),
           public.haversine_m(p_lat, p_lng, c.latitude, c.longitude)
    FROM public.cities c
    WHERE p_country_id IS NOT NULL AND c.country_id = p_country_id
      AND extensions.similarity(c.name_normalized, public.normalize_name(p_name)) > 0.3
      AND c.duplicate_of_id IS NULL
    UNION ALL
    SELECT c.id, 'name_geo_proximity',
           least(extensions.similarity(c.name_normalized, public.normalize_name(p_name))::numeric, 0.86),
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

CREATE OR REPLACE FUNCTION public.find_country_duplicate_candidates(
  p_name text,
  p_code text DEFAULT NULL::text,
  p_limit integer DEFAULT 10)
 RETURNS TABLE(country_id uuid, match_type text, score numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
  WITH candidates AS (
    -- identity: ISO 3166-1 alpha-2
    SELECT c.id AS cid, 'code_exact'::text AS mt, 1.00::numeric AS sc
    FROM public.countries c
    WHERE p_code IS NOT NULL AND c.code = upper(btrim(p_code)) AND c.duplicate_of_id IS NULL
    UNION ALL
    -- an exact name, but never against a country whose own code disagrees
    SELECT c.id, 'name_exact', 0.98 FROM public.countries c
    WHERE public.normalize_name(c.name) = public.normalize_name(p_name) AND c.duplicate_of_id IS NULL
      AND NOT (p_code IS NOT NULL AND c.code IS NOT NULL AND c.code <> upper(btrim(p_code)))
    UNION ALL
    -- resemblance: review only, capped under the 0.95 auto bar, and likewise
    -- never against a disagreeing code.
    SELECT c.id, 'name_proximity',
           least(extensions.similarity(c.name_normalized, public.normalize_name(p_name))::numeric, 0.86)
    FROM public.countries c
    WHERE extensions.similarity(c.name_normalized, public.normalize_name(p_name)) > 0.3
      AND c.duplicate_of_id IS NULL
      AND NOT (p_code IS NOT NULL AND c.code IS NOT NULL AND c.code <> upper(btrim(p_code)))
  ),
  best AS (SELECT DISTINCT ON (cid) cid, mt, sc FROM candidates ORDER BY cid, sc DESC)
  SELECT cid, mt, sc FROM best ORDER BY sc DESC LIMIT p_limit;
$function$;

-- grants are unchanged by CREATE OR REPLACE; restate them so a future rebuild
-- from this file alone is complete.
GRANT EXECUTE ON FUNCTION public.find_city_duplicate_candidates(text, uuid, numeric, numeric, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_country_duplicate_candidates(text, text, integer)
  TO anon, authenticated, service_role;

do $verify$
declare
  v_city_score numeric;
  v_city_raw   numeric;
  v_co_score   numeric;
  v_co_raw     numeric;
  v_de         uuid;
begin
  select country_id into v_de from public.cities where name = 'Berlin-Rixdorf' limit 1;

  -- BINDING probe, and the case that motivated this migration. Trigram
  -- similarity is word-order blind, so "Rixdorf, Berlin" scores a RAW 1.000
  -- against "Berlin-Rixdorf" while their despaced keys differ
  -- (rixdorfberlin vs berlinrixdorf) -- no exact arm fires, and before this
  -- change the engine auto-merged on it. The cap must bring that to 0.86.
  select extensions.similarity(c.name_normalized, public.normalize_name('Rixdorf, Berlin'))::numeric
    into v_city_raw
  from public.cities c where c.name = 'Berlin-Rixdorf' limit 1;

  select f.score into v_city_score
  from public.find_city_duplicate_candidates('Rixdorf, Berlin', v_de, null, null, 10) f
  join public.cities c on c.id = f.city_id
  where c.name = 'Berlin-Rixdorf' and f.match_type in ('name_proximity_country','name_geo_proximity');

  if v_city_raw is null or v_city_score is null then
    raise exception 'the city cap probe returned nothing -- the test would be vacuous';
  end if;
  if v_city_raw <= 0.86 then
    raise exception 'the city cap probe no longer exceeds the cap (raw %) -- it no longer binds', v_city_raw;
  end if;
  if v_city_score > 0.86 then
    raise exception 'a fuzzy city arm returned % -- above the 0.86 cap', v_city_score;
  end if;
  -- and it must stay under the auto bar even when an embedding fully agrees
  if v_city_score + 0.05 >= 0.92 then
    raise exception 'a fuzzy city arm can still reach the auto-merge bar';
  end if;

  -- BINDING probe for countries: raw 0.889 must come back capped.
  select extensions.similarity(c.name_normalized,
           public.normalize_name('Central African Republicc'))::numeric
    into v_co_raw
  from public.countries c where c.name = 'Central African Republic' limit 1;

  select f.score into v_co_score
  from public.find_country_duplicate_candidates('Central African Republicc', null, 10) f
  join public.countries c on c.id = f.country_id
  where c.name = 'Central African Republic' and f.match_type = 'name_proximity';

  if v_co_raw is null or v_co_score is null then
    raise exception 'the country cap probe returned nothing -- the test would be vacuous';
  end if;
  if v_co_raw <= 0.86 then
    raise exception 'the country cap probe no longer exceeds the cap (raw %)', v_co_raw;
  end if;
  if v_co_score > 0.86 then
    raise exception 'a fuzzy country arm returned % -- above the 0.86 cap', v_co_score;
  end if;

  -- ISO veto, with a positive control so "returns nothing" cannot pass vacuously.
  if exists (select 1 from public.find_country_duplicate_candidates('Nigeria','NE',10) f
             join public.countries c on c.id = f.country_id where c.code = 'NG') then
    raise exception 'the ISO code veto did not fire';
  end if;
  if not exists (select 1 from public.find_country_duplicate_candidates('Nigeria','NG',10) f
                 join public.countries c on c.id = f.country_id where c.code = 'NG') then
    raise exception 'positive control failed -- Nigeria under its own code is unreachable';
  end if;

  -- exact identity must still auto: the caps may not have broken the good path.
  if not exists (select 1 from public.find_city_duplicate_candidates('Berlin', v_de, null, null, 10)
                 where match_type = 'name_exact_country' and score >= 0.99) then
    raise exception 'positive control failed -- an exact city name no longer scores for auto-merge';
  end if;
end
$verify$;
