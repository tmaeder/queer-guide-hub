-- City refresh selector v2 — break the starvation loop.
--
-- The v1 ordering was:
--   (last_refreshed_at IS NOT NULL), (shell_status NOT IN ('placeholder','ghost')),
--   completeness_score ASC, last_refreshed_at ASC
-- Once every city had been visited once, `never_refreshed` went to 0 and the
-- first key became constant, so the order collapsed to "placeholders first,
-- lowest completeness first". That pinned the crawler to ~545 completeness-2
-- rows from a 2026-06-10/19 import whose names are region-qualified or
-- German-localized ("Kapstadt, Südafrika", "El Cajon, Kalifornien, USA") or not
-- cities at all ("Indonesien", "—N/a"). Those names 404 Wikipedia and return
-- zero wbsearchentities hits, so nothing filled, completeness stayed 2, and the
-- same cohort was re-selected forever: 2,921 enrichment_log rows over 545
-- distinct cities in 30 days, with zero fields written since 2026-06-23.
--
-- Two changes fix it:
--   1. Content-bearing cities (2,234 with venues or events, of which only 9 have
--      a comma in the name) sort FIRST, and the placeholder-first tier is gone.
--   2. Terminal sentinels in enrichment_status evict rows we have proven we
--      cannot resolve, mirroring the countries `data_unavailable` pattern.

DROP FUNCTION IF EXISTS public.cities_due_for_refresh(int);

CREATE OR REPLACE FUNCTION public.cities_due_for_refresh(
  p_limit int DEFAULT 25,
  p_scope text DEFAULT 'content_first'   -- 'content_first' | 'all' | 'content_only'
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
      -- terminal: proven unresolvable against every free source
      AND COALESCE(c.enrichment_status->'wikidata_link'->>'state', '') <> 'data_unavailable'
      -- terminal: an admin archived this row as not-a-place
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
    CASE WHEN p_scope = 'all' THEN 0 ELSE (NOT s.has_content)::int END,  -- content first
    (s.slug LIKE 'tmp-%')::int,                                          -- real slugs before stubs
    (s.last_refreshed_at IS NOT NULL),                                   -- never-refreshed first
    s.completeness_score ASC,
    s.last_refreshed_at ASC NULLS FIRST
  LIMIT greatest(1, least(p_limit, 1000));
$function$;

ALTER FUNCTION public.cities_due_for_refresh(int, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cities_due_for_refresh(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cities_due_for_refresh(int, text) TO service_role, authenticated;
COMMENT ON FUNCTION public.cities_due_for_refresh(int, text) IS
  'Prioritized city enrichment work-list. Content-bearing cities first; skips rows whose enrichment_status marks them terminally unresolvable or archived as not-a-place.';

-- Recovery lever: strip terminal sentinels so a batch can be re-attempted after
-- a resolver bug. Capped at 300 rows/call — a cities UPDATE fans out through
-- trg_sync_geo_spine into geo_places + a ~40-column geo_city_profiles upsert and
-- a search_documents delete+insert (HNSW maintenance), so bulk writes storm the
-- search sync on this disk-constrained DB. The driver loops it.
CREATE OR REPLACE FUNCTION public.reset_city_enrichment_state(
  p_keys text[] DEFAULT NULL,          -- NULL = every key currently 'data_unavailable'
  p_city_ids uuid[] DEFAULT NULL,      -- NULL = any city
  p_batch int DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_batch int := greatest(1, least(coalesce(p_batch, 300), 300));
  v_changed int := 0;
BEGIN
  -- anon is not granted EXECUTE at all. A JWT-bearing caller must be an admin;
  -- a call with no uid is the service role / cron path.
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  WITH target AS (
    SELECT c.id,
           COALESCE(
             (SELECT jsonb_object_agg(k, v)
                FROM jsonb_each(c.enrichment_status) AS e(k, v)
               WHERE NOT (
                 (p_keys IS NULL AND v->>'state' = 'data_unavailable')
                 OR (p_keys IS NOT NULL AND k = ANY(p_keys))
               )),
             '{}'::jsonb) AS next_status
    FROM public.cities c
    WHERE (p_city_ids IS NULL OR c.id = ANY(p_city_ids))
      AND c.enrichment_status <> '{}'::jsonb
      AND EXISTS (
        SELECT 1 FROM jsonb_each(c.enrichment_status) AS e(k, v)
        WHERE (p_keys IS NULL AND v->>'state' = 'data_unavailable')
           OR (p_keys IS NOT NULL AND k = ANY(p_keys))
      )
    ORDER BY c.id
    LIMIT v_batch
  ), upd AS (
    UPDATE public.cities c
       SET enrichment_status = t.next_status
      FROM target t
     WHERE c.id = t.id
       AND c.enrichment_status IS DISTINCT FROM t.next_status
    RETURNING c.id
  )
  SELECT count(*) INTO v_changed FROM upd;

  RETURN jsonb_build_object('reset', v_changed, 'batch', v_batch,
                            'keys', COALESCE(to_jsonb(p_keys), 'null'::jsonb));
END; $function$;

ALTER FUNCTION public.reset_city_enrichment_state(text[], uuid[], int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reset_city_enrichment_state(text[], uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_city_enrichment_state(text[], uuid[], int) TO service_role, authenticated;
COMMENT ON FUNCTION public.reset_city_enrichment_state(text[], uuid[], int) IS
  'Admin recovery: clear terminal enrichment_status sentinels so cities re-enter cities_due_for_refresh. 300/batch (search-sync trigger storm).';
