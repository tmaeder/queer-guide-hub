-- Derived city fields: cost-of-living band and IANA timezone.
--
-- Both columns were empty (cost_of_living 0/5113, timezone 1952/5113) and
-- neither has a free per-city source. Rather than leave them blank or invent
-- numbers, each is derived from a fact we already hold, and each says so in the
-- value the reader sees.

-- ---------------------------------------------------------------- cost band
--
-- There is no free per-city cost index (Numbeo is paid). The only defensible
-- input is countries.gdp_per_capita_usd, populated from the World Bank by
-- pipeline-enrich-country-stats (222/250 countries).
--
-- Deliberately NO numeric index and NO currency amounts: a country GDP figure
-- cannot support "rent: $1,400", and inventing one is the exact failure this
-- backfill is meant to avoid. The `scope` line is not decoration — it is the
-- honesty guard that stops a reader concluding Zürich and Chur cost the same.
-- CityOverviewTab's DefinitionGrid renders EVERY key as a visible row, so this
-- object contains only reader-facing text; provenance goes to field_provenance.
CREATE OR REPLACE FUNCTION public.derive_city_cost_band(p_gdp_pc numeric)
RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE WHEN p_gdp_pc IS NULL THEN NULL ELSE
    jsonb_build_object(
      'band', CASE
        WHEN p_gdp_pc >= 55000 THEN 'very high'
        WHEN p_gdp_pc >= 35000 THEN 'high'
        WHEN p_gdp_pc >= 15000 THEN 'moderate'
        WHEN p_gdp_pc >=  5000 THEN 'low'
        ELSE                        'very low' END,
      'basis', 'Country GDP per capita (World Bank): $' || to_char(round(p_gdp_pc), 'FM999,999,999'),
      'scope', 'Country-level estimate, not city-specific'
    )
  END;
$function$;

ALTER FUNCTION public.derive_city_cost_band(numeric) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.derive_city_cost_band(numeric) TO service_role, authenticated;
COMMENT ON FUNCTION public.derive_city_cost_band(numeric) IS
  'Coarse cost-of-living band from country GDP per capita. Never emits numeric indices or currency amounts — the input cannot support them.';

CREATE OR REPLACE FUNCTION public.run_city_cost_of_living_backfill(p_batch int DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_batch int := greatest(1, least(coalesce(p_batch, 300), 300));
  v_updated int := 0;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  WITH target AS (
    SELECT c.id, public.derive_city_cost_band(co.gdp_per_capita_usd) AS band
    FROM public.cities c
    JOIN public.countries co ON co.id = c.country_id
    WHERE c.duplicate_of_id IS NULL
      AND c.shell_status <> 'merged'
      AND co.gdp_per_capita_usd IS NOT NULL
      AND (c.cost_of_living IS NULL OR c.cost_of_living = '{}'::jsonb)
    ORDER BY c.id
    LIMIT v_batch
  ), upd AS (
    UPDATE public.cities c
       SET cost_of_living = t.band,
           field_provenance = jsonb_set(
             coalesce(c.field_provenance, '{}'::jsonb), '{cost_of_living}',
             jsonb_build_object('value', t.band, 'sources', jsonb_build_array('derived'),
                                'source', 'derived', 'at', now()), true)
      FROM target t
     WHERE c.id = t.id AND t.band IS NOT NULL
       AND c.cost_of_living IS DISTINCT FROM t.band
    RETURNING c.id
  )
  SELECT count(*) INTO v_updated FROM upd;

  RETURN jsonb_build_object('updated', v_updated, 'batch', v_batch);
END; $function$;

ALTER FUNCTION public.run_city_cost_of_living_backfill(int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_cost_of_living_backfill(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_city_cost_of_living_backfill(int) TO service_role, authenticated;

-- ---------------------------------------------------------------- timezone
--
-- Wikidata P421 is NOT usable here: it yields items like "UTC+02:00" (Q6723),
-- while cities.timezone holds IANA identifiers (Europe/Berlin, America/Sao_Paulo)
-- that CityOverviewTab renders directly. Writing P421 would corrupt a clean
-- column. Instead inherit the country's zone, but only where the country has
-- exactly one — multi-zone countries and those with overseas territories are
-- excluded and stay NULL rather than being guessed wrong.
CREATE OR REPLACE FUNCTION public.run_city_timezone_backfill(p_batch int DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_batch int := greatest(1, least(coalesce(p_batch, 300), 300));
  v_updated int := 0;
  -- Countries spanning more than one IANA zone, or holding overseas territories.
  v_multi text[] := ARRAY['US','CA','BR','RU','AU','MX','ID','KZ','CD','CL','EC',
                          'ES','PT','FR','NL','DK','GB','NZ','CN','MN','PF','KI','UM','AQ'];
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  WITH target AS (
    SELECT c.id, co.timezone
    FROM public.cities c
    JOIN public.countries co ON co.id = c.country_id
    WHERE c.duplicate_of_id IS NULL
      AND c.shell_status <> 'merged'
      AND c.timezone IS NULL
      AND co.timezone IS NOT NULL
      AND co.timezone LIKE '%/%'            -- IANA shape only, never "UTC+2"
      AND NOT (co.code = ANY(v_multi))
    ORDER BY c.id
    LIMIT v_batch
  ), upd AS (
    UPDATE public.cities c
       SET timezone = t.timezone,
           field_provenance = jsonb_set(
             coalesce(c.field_provenance, '{}'::jsonb), '{timezone}',
             jsonb_build_object('value', t.timezone, 'sources', jsonb_build_array('derived'),
                                'source', 'derived:country-timezone', 'at', now()), true)
      FROM target t
     WHERE c.id = t.id AND c.timezone IS DISTINCT FROM t.timezone
    RETURNING c.id
  )
  SELECT count(*) INTO v_updated FROM upd;

  RETURN jsonb_build_object('updated', v_updated, 'batch', v_batch);
END; $function$;

ALTER FUNCTION public.run_city_timezone_backfill(int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_timezone_backfill(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_city_timezone_backfill(int) TO service_role, authenticated;
COMMENT ON FUNCTION public.run_city_timezone_backfill(int) IS
  'Inherit the country IANA timezone for cities in single-zone countries. Multi-zone countries stay NULL. 300/batch (search-sync trigger storm).';

-- Registered PAUSED, following run_city_safety_backfill: these are operator
-- backfills, not perpetual jobs — once the tail is filled there is nothing left
-- to do, and an enabled cron would just re-scan 5k rows nightly for nothing.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('city_cost_of_living_backfill', 'Backfill city cost-of-living band',
   'Derives a coarse cost band from the country GDP per capita. No numeric indices — the source cannot support them.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_city_cost_of_living_backfill"}'::jsonb, '10 5 * * 0'),
  ('city_timezone_backfill', 'Backfill city timezone from country',
   'Inherits the country IANA timezone for cities in single-zone countries. Multi-zone countries stay NULL.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_city_timezone_backfill"}'::jsonb, '20 5 * * 0')
ON CONFLICT (slug) DO UPDATE
  SET description = EXCLUDED.description, action = EXCLUDED.action, schedule = EXCLUDED.schedule;
