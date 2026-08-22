-- Decouple the adult-cohort exclusion from the SHAPE of profession strings.
--
-- personality_profession_facets and get_personality_profession_facets hid the
-- adult cohort with four ILIKE patterns over `profession`
-- (20260818110200_personality_profession_facets_matview.sql). That coupling is
-- about to become dangerous: the German-normalization work that follows this
-- migration rewrites `profession` corpus-wide, and a pattern that stops matching
-- silently promotes ~7k adult performers into the public People-page facet list.
--
-- personalities.is_adult already exists (20260505000000_personalities_is_adult_flag)
-- and the read side already trusts it (src/hooks/usePageFetchers.ts filters
-- .eq('is_adult', false)). Key on the column, and keep the four patterns as an
-- additional OR — measured on prod 2026-09-16 the two disagree in both directions:
--   is_adult = true .............................. 7,012
--   matches an ILIKE pattern ..................... 6,967
--   flag set, no matching string ..................... 46
--   matching string, flag not set ..................... 1
-- so neither predicate alone is a superset of the other and the union is the only
-- safe cohort. Net effect here is 46 additional people excluded from the facet
-- counts — every one of them genuinely flagged adult.

DROP MATERIALIZED VIEW IF EXISTS public.personality_profession_facets;

CREATE MATERIALIZED VIEW public.personality_profession_facets AS
  WITH raw AS (
    SELECT p.profession AS raw_profession, COUNT(*)::bigint AS cnt
    FROM public.personalities p
    WHERE p.visibility = 'public'
      AND p.profession IS NOT NULL
      AND p.profession <> ''
      -- Union of both cohort signals; see header.
      AND NOT p.is_adult
      AND p.profession NOT ILIKE '%adult performer%'
      AND p.profession NOT ILIKE '%adult model%'
      AND p.profession NOT ILIKE '%adult film%'
      AND p.profession NOT ILIKE '%porn%'
    GROUP BY p.profession
  ),
  normalized AS (
    SELECT public.normalize_profession(raw_profession) AS profession, cnt
    FROM raw
  )
  SELECT profession, SUM(cnt)::bigint AS cnt
  FROM normalized
  WHERE profession IS NOT NULL
  GROUP BY profession;

-- Unique index is required by REFRESH ... CONCURRENTLY (the nightly cron
-- profession_facets_refresh, 35 4 * * *, registered in admin_automations).
CREATE UNIQUE INDEX personality_profession_facets_profession_key
  ON public.personality_profession_facets (profession);

GRANT SELECT ON public.personality_profession_facets TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.personality_profession_facets IS
  'People-page facet counts. Adult cohort excluded by is_adult OR the legacy ILIKE '
  'patterns (union — the two disagree in both directions). Refreshed nightly by '
  'profession_facets_refresh; normalizes per DISTINCT raw value, then aggregates.';

-- Same signature and return shape; the cohort predicate lives in the MV.
CREATE OR REPLACE FUNCTION public.get_personality_profession_facets(lim integer DEFAULT 20)
 RETURNS TABLE(profession text, cnt bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT f.profession, f.cnt
  FROM public.personality_profession_facets f
  ORDER BY f.cnt DESC, f.profession ASC
  LIMIT GREATEST(lim, 1);
$function$;

REFRESH MATERIALIZED VIEW public.personality_profession_facets;
