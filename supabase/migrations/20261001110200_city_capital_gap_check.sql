-- Keep the capital flag from silently drifting away from countries.capital again.
--
-- The flag is DERIVED from `countries.capital` and was never once revalidated
-- against it — the same failure class that let 86 cities publish another
-- country's safety notes for two months. Nothing detected the 48 defects the
-- repair migration just fixed, and without a detector the next country relink
-- or capital change reopens them.
--
-- No new cron and no new table: run_city_coverage_radar() already walks EVERY
-- non-duplicate city weekly and writes city_coverage_gaps, which is exactly the
-- shape this needs.
--
-- Deliberately NOT checked recurringly: "this country has more than one flagged
-- capital". South Africa (Pretoria / Cape Town / Bloemfontein) and Bolivia
-- (Sucre / La Paz) really do, so that would report a defect for correct data.
-- It is asserted once, in the repair migration, where the count was measured to
-- be zero.

-- ---------------------------------------------------------------- country view
--
-- The per-city gap list cannot represent "this country's capital has no city row
-- at all" — city_coverage_gaps is keyed by city_id, and the whole defect is that
-- there is no city. So the country-level form gets its own read-only RPC.
--
-- Resolution keys on the FLAG, not on the name. Bermuda's row is 'City of
-- Hamilton' against capital 'Hamilton' and Macau's is 'Macau/Macao' against
-- 'Macao'; both are alias spellings of the right place, and a name-equality test
-- would report them as broken forever.

CREATE OR REPLACE FUNCTION public.city_capital_gaps()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH flagged AS (
    SELECT c.country_id,
           count(*)::int AS n,
           (array_agg(c.name ORDER BY c.name))[1] AS a_name
      FROM public.cities c
     WHERE c.duplicate_of_id IS NULL AND c.is_capital
     GROUP BY c.country_id
  ),
  rows AS (
    SELECT co.code,
           co.name AS country,
           co.capital,
           coalesce(f.n, 0) AS flagged_cities,
           f.a_name AS flagged_name,
           CASE
             WHEN nullif(btrim(co.capital), '') IS NULL AND coalesce(f.n,0) = 0 THEN NULL
             WHEN nullif(btrim(co.capital), '') IS NOT NULL AND coalesce(f.n,0) = 0 THEN 'no_flagged_city'
             WHEN nullif(btrim(co.capital), '') IS NULL AND coalesce(f.n,0) > 0 THEN 'flagged_without_capital_text'
             ELSE NULL
           END AS gap
      FROM public.countries co
      LEFT JOIN flagged f ON f.country_id = co.id
     WHERE co.duplicate_of_id IS NULL
  )
  SELECT jsonb_build_object(
    'checked_at', now(),
    'countries', (SELECT count(*) FROM rows),
    'ok', (SELECT count(*) FROM rows WHERE gap IS NULL),
    'gaps', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.country), '[]'::jsonb)
               FROM rows r WHERE r.gap IS NOT NULL)
  );
$$;

COMMENT ON FUNCTION public.city_capital_gaps() IS
  'Country-level capital-flag audit: which countries name a capital with no flagged city, and which have a flagged city but no capital text. The per-city half lives in city_coverage_gaps.missing_fields as capital_flag_missing.';

REVOKE ALL ON FUNCTION public.city_capital_gaps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.city_capital_gaps() TO authenticated, service_role;

-- ---------------------------------------------------------------- radar

CREATE OR REPLACE FUNCTION public.run_city_coverage_radar(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_examined      int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'city_coverage_radar';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'city_coverage_radar', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH
  -- Precomputed once per country rather than as a correlated subquery per city:
  -- the radar already pays for five of those per row.
  capflag AS (
    SELECT c.country_id, bool_or(c.is_capital) AS has_capital
      FROM public.cities c
     WHERE c.duplicate_of_id IS NULL
     GROUP BY c.country_id
  ),
  base AS (
    SELECT c.id, c.name, c.slug, c.seo_indexable, c.completeness_score,
      c.description, c.lgbt_friendly_rating, c.editorial_hook, c.best_time_to_visit,
      c.local_customs, c.image_url, c.curated_image_url, c.latitude, c.longitude,
      c.timezone, c.population, c.major_airport_code,
      c.is_capital,
      nullif(btrim(co.capital), '') AS country_capital,
      coalesce(cf.has_capital, false) AS country_has_capital,
      (SELECT count(*) FROM public.venues v WHERE v.city_id=c.id AND v.duplicate_of_id IS NULL) AS venues,
      (SELECT count(*) FROM public.events e WHERE e.city_id=c.id AND e.duplicate_of_id IS NULL) AS events,
      (SELECT count(*) FROM public.queer_villages q WHERE q.city_id=c.id) AS villages,
      (SELECT count(*) FROM public.festivals f WHERE f.city_id=c.id) AS festivals,
      (SELECT count(*) FROM public.hotels h WHERE h.city_id=c.id) AS hotels
    FROM public.cities c
    LEFT JOIN public.countries co ON co.id = c.country_id
    LEFT JOIN capflag cf ON cf.country_id = c.country_id
    WHERE c.duplicate_of_id IS NULL
  ),
  computed AS (
    SELECT b.*,
      (b.venues=0 AND b.events=0) AS is_empty,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN b.description IS NULL OR length(trim(b.description))<40 THEN 'description' END,
        CASE WHEN b.lgbt_friendly_rating IS NULL THEN 'lgbt_friendly_rating' END,
        CASE WHEN b.editorial_hook IS NULL THEN 'editorial_hook' END,
        CASE WHEN b.villages=0 THEN 'neighborhoods' END,
        CASE WHEN b.best_time_to_visit IS NULL THEN 'best_time_to_visit' END,
        CASE WHEN b.local_customs IS NULL THEN 'local_customs' END,
        CASE WHEN b.image_url IS NULL AND b.curated_image_url IS NULL THEN 'image' END,
        CASE WHEN b.latitude IS NULL OR b.longitude IS NULL THEN 'coords' END,
        CASE WHEN b.timezone IS NULL THEN 'timezone' END,
        CASE WHEN b.population IS NULL THEN 'population' END,
        CASE WHEN b.major_airport_code IS NULL THEN 'major_airport_code' END,
        -- This city is named like its country's capital, is not flagged, and no
        -- sibling is flagged either. All three conditions matter: without the
        -- third, every alias spelling reports forever; without the second, a
        -- correctly flagged capital reports itself.
        CASE WHEN b.country_capital IS NOT NULL
              AND NOT b.country_has_capital
              AND NOT b.is_capital
              AND public.city_name_key(b.name) = public.city_name_key(b.country_capital)
             THEN 'capital_flag_missing' END
      ], NULL) AS missing
    FROM base b
  ),
  routed AS (
    SELECT c.*,
      CASE WHEN c.slug LIKE 'tmp-%' THEN 'placeholder'
           WHEN c.seo_indexable AND c.is_empty THEN 'ghost'
           ELSE 'real' END AS shell,
      CASE WHEN c.slug LIKE 'tmp-%' THEN 'merge'
           WHEN c.seo_indexable AND c.is_empty THEN 'review'
           ELSE 'enrich' END AS resolution,
      least(100, greatest(0, 100 - coalesce(c.completeness_score,0)
            + CASE WHEN c.is_empty THEN 10 ELSE 0 END))::smallint AS gap_score
    FROM computed c
  ),
  upsert AS (
    INSERT INTO public.city_coverage_gaps
      (city_id, city_name, gap_score, missing_fields, content_counts, shell_status, resolution, suggested_actions, status, last_checked_at)
    SELECT r.id, r.name, r.gap_score, r.missing,
      jsonb_build_object('venues',r.venues,'events',r.events,'villages',r.villages,'festivals',r.festivals,'hotels',r.hotels),
      r.shell, r.resolution,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'field', mf,
                'source', CASE mf
                            WHEN 'description' THEN 'wikipedia'
                            WHEN 'coords' THEN 'wikidata'
                            WHEN 'timezone' THEN 'wikidata'
                            WHEN 'population' THEN 'wikidata'
                            WHEN 'major_airport_code' THEN 'wikidata'
                            WHEN 'image' THEN 'wikipedia'
                            WHEN 'lgbt_friendly_rating' THEN 'llm'
                            WHEN 'editorial_hook' THEN 'llm'
                            WHEN 'best_time_to_visit' THEN 'llm'
                            WHEN 'local_customs' THEN 'llm'
                            WHEN 'neighborhoods' THEN 'manual'
                            WHEN 'capital_flag_missing' THEN 'manual'
                            ELSE 'llm' END,
                'q', r.name)), '[]'::jsonb)
       FROM unnest(r.missing) AS mf),
      'open', now()
    FROM routed r
    ON CONFLICT (city_id) DO UPDATE
      SET city_name=EXCLUDED.city_name, gap_score=EXCLUDED.gap_score,
          missing_fields=EXCLUDED.missing_fields, content_counts=EXCLUDED.content_counts,
          shell_status=EXCLUDED.shell_status, resolution=EXCLUDED.resolution,
          suggested_actions=EXCLUDED.suggested_actions, last_checked_at=now(),
          status=CASE WHEN public.city_coverage_gaps.status='ignored' THEN 'ignored'
                      WHEN EXCLUDED.gap_score=0 THEN 'resolved' ELSE 'open' END
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upsert;

  UPDATE public.city_coverage_gaps g SET status='resolved', last_checked_at=now()
  WHERE g.status IN ('open','queued')
    AND EXISTS (SELECT 1 FROM public.cities c WHERE c.id=g.city_id AND c.completeness_score >= 70);

  SELECT count(*) INTO v_examined FROM public.cities WHERE duplicate_of_id IS NULL;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('gaps_upserted',v_changed,'cities_examined',v_examined,'forced',p_force,
                                   'capital_gaps', public.city_capital_gaps()->'gaps') WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('gaps_upserted',v_changed,'cities_examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $function$;
