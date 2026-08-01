-- Staleness must outrank completeness in the refresh selector.
--
-- Follow-up to 20260801133923_city_selector_unblock. Sorting by
-- completeness_score ASC before last_refreshed_at re-creates the starvation
-- shape it was meant to fix: completeness_score is only recomputed by the
-- nightly job, so a city that has just been enriched still advertises its OLD
-- low score and is re-selected on the very next batch. Cities that resolve but
-- have nothing left to fill are worse — their score never rises at all, so they
-- are picked forever. Observed live: batch 6 of the first sweep returned 40/40
-- 'no_empty_fields' after batches 1-4 averaged 36/40 filled.
--
-- Ordering by last_refreshed_at ASC NULLS FIRST makes each pass round-robin: no
-- city repeats until the whole pool has been visited. NULLS FIRST also subsumes
-- the old explicit never-refreshed tier. completeness stays as the tiebreaker
-- among equally-stale rows.

CREATE OR REPLACE FUNCTION public.cities_due_for_refresh(
  p_limit int DEFAULT 25,
  p_scope text DEFAULT 'content_first'
)
RETURNS TABLE (
  id uuid, name text, slug text, latitude numeric, longitude numeric,
  country_id uuid, description text, official_website text,
  completeness_score smallint, shell_status text, last_refreshed_at timestamptz,
  refresh_reason text,
  has_content boolean,
  wikidata_qid text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH scope AS (
    SELECT c.id, c.name, c.slug, c.latitude, c.longitude, c.country_id,
           c.description, c.official_website, c.completeness_score, c.shell_status,
           c.last_refreshed_at, c.wikidata_qid,
           (EXISTS (SELECT 1 FROM public.venues v WHERE v.city_id = c.id)
             OR EXISTS (SELECT 1 FROM public.events e WHERE e.city_id = c.id)) AS has_content
    FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND c.shell_status <> 'merged'
      AND COALESCE(c.enrichment_status->'wikidata_link'->>'state', '') <> 'data_unavailable'
      AND COALESCE(c.enrichment_status->'disposition'->>'state', '')   <> 'not_a_city'
  )
  SELECT s.id, s.name, s.slug, s.latitude, s.longitude, s.country_id,
         s.description, s.official_website, s.completeness_score, s.shell_status,
         s.last_refreshed_at,
         CASE
           WHEN s.last_refreshed_at IS NULL THEN 'never_refreshed'
           WHEN s.wikidata_qid IS NULL      THEN 'unlinked'
           WHEN s.completeness_score < 40   THEN 'low_completeness'
           ELSE 'stale'
         END AS refresh_reason,
         s.has_content, s.wikidata_qid
  FROM scope s
  WHERE (p_scope <> 'content_only' OR s.has_content)
  ORDER BY
    CASE WHEN p_scope = 'all' THEN 0 ELSE (NOT s.has_content)::int END,
    (s.slug LIKE 'tmp-%')::int,
    s.last_refreshed_at ASC NULLS FIRST,
    s.completeness_score ASC
  LIMIT greatest(1, least(p_limit, 1000));
$function$;

ALTER FUNCTION public.cities_due_for_refresh(int, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cities_due_for_refresh(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cities_due_for_refresh(int, text) TO service_role, authenticated;
