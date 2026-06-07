-- Work-list selector for the city enrichment loop (city-factual-backfill / city-agentic-enrich).
-- Analog of venues_due_for_refresh. Keys off cities.last_refreshed_at (content refresh),
-- NOT last_verified_at (trust scoring stamp), so the two loops don't starve each other.
-- Priority: never-refreshed > placeholder/ghost shells > lowest completeness > oldest refresh.
CREATE OR REPLACE FUNCTION public.cities_due_for_refresh(p_limit int DEFAULT 25)
RETURNS TABLE (
  id                 uuid,
  name               text,
  slug               text,
  latitude           numeric,
  longitude          numeric,
  country_id         uuid,
  description        text,
  official_website   text,
  completeness_score smallint,
  shell_status       text,
  last_refreshed_at  timestamptz,
  refresh_reason     text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.slug, c.latitude, c.longitude, c.country_id,
         c.description, c.official_website, c.completeness_score, c.shell_status,
         c.last_refreshed_at,
         CASE
           WHEN c.last_refreshed_at IS NULL THEN 'never_refreshed'
           WHEN c.shell_status IN ('placeholder','ghost') THEN 'shell'
           WHEN c.completeness_score < 40 THEN 'low_completeness'
           ELSE 'stale'
         END AS refresh_reason
  FROM public.cities c
  WHERE c.duplicate_of_id IS NULL
  ORDER BY
    (c.last_refreshed_at IS NOT NULL),                 -- nulls first
    (c.shell_status NOT IN ('placeholder','ghost')),   -- shells first
    c.completeness_score ASC,
    c.last_refreshed_at ASC NULLS FIRST
  LIMIT greatest(1, least(p_limit, 1000));
$$;
ALTER FUNCTION public.cities_due_for_refresh(int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cities_due_for_refresh(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cities_due_for_refresh(int) TO service_role, authenticated;

COMMENT ON FUNCTION public.cities_due_for_refresh(int) IS
  'Prioritized batch of cities for the continuous enrichment loop. Excludes duplicates.';
