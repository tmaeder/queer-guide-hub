-- get_personality_profession_facets scanned all public personalities and ran
-- normalize_profession() (two correlated subqueries into professions) per ROW:
-- 1.6 s mean, max pinned at the anon 3 s statement_timeout — the People page
-- facet list simply failed under load (15.5k calls since 2026-05-03).
-- Fix: precompute into a tiny materialized view (normalize per DISTINCT raw
-- profession, then aggregate), refreshed nightly; the RPC becomes an indexed
-- read. Facet counts are directory filters — 24 h staleness is fine.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.personality_profession_facets AS
  WITH raw AS (
    SELECT p.profession AS raw_profession, COUNT(*)::bigint AS cnt
    FROM public.personalities p
    WHERE p.visibility = 'public'
      AND p.profession IS NOT NULL
      AND p.profession <> ''
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

CREATE UNIQUE INDEX IF NOT EXISTS personality_profession_facets_profession_key
  ON public.personality_profession_facets (profession);

GRANT SELECT ON public.personality_profession_facets TO anon, authenticated, service_role;

-- Same signature, same return shape — the RPC now reads the matview.
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

-- Nightly refresh + registry row (registry-of-record contract).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'profession_facets_refresh') THEN
    PERFORM cron.schedule(
      'profession_facets_refresh',
      '35 4 * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.personality_profession_facets;'
    );
  END IF;
END $$;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'profession_facets_refresh',
  'Profession facets refresh',
  'Nightly refresh of personality_profession_facets (People page facet counts; replaces a per-request full scan that hit the anon 3 s timeout).',
  'user',
  true,
  '{"type": "schedule"}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'profession_facets_refresh',
    'command', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.personality_profession_facets;'
  ),
  '35 4 * * *'
)
ON CONFLICT (slug) DO NOTHING;
