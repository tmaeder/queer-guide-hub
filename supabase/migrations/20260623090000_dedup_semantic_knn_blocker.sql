-- Unified deduplication — semantic KNN blocker (2026-06-23)
--
-- The ingest-time dedup pipeline (pipeline-deduplicate) relied on deterministic
-- blockers only: exact keys (phone/email/url/code/source_entity_id), pg_trgm
-- name/title similarity, geo (haversine) and the news SHA-256 fingerprint. These
-- miss paraphrase / translation / abbreviation / word-reorder duplicates
-- (e.g. "Café de Flore" vs "Cafe Flore", DE vs EN event titles).
--
-- We already maintain 1024-d bge-m3 embeddings for every entity type in
-- search_embeddings (HNSW vector_cosine_ops, kept fresh by the forward-sync
-- trigger from 20260620090000). This RPC exposes that index as ONE generic
-- semantic blocker the dedup engine fuses with the deterministic signals.
--
-- PERF — mirrors the search_hybrid vector path (20260621120000), which fixed the
-- exact two traps here:
--   1. Filtered-ANN: pgvector's HNSW index can only serve `ORDER BY embedding
--      <=> $vec LIMIT k` over search_embeddings ALONE — a filter on the joined
--      search_documents (entity_type) forces a seq-scan + full sort. So we ANN
--      FIRST into a `vnn` pool (index scan), THEN join + filter entity_type.
--   2. Generic-plan HNSW miss: a LANGUAGE sql function called repeatedly via
--      PostgREST gets a cached GENERIC plan that can't use HNSW for an embedding
--      PARAMETER → seq scan over ~80k rows. LANGUAGE plpgsql + dynamic EXECUTE +
--      plan_cache_mode='force_custom_plan' gives a one-shot custom plan → HNSW.
--
-- Design notes:
--   * Geo distance is RETURNED, not filtered — the conflict guards live in the
--     TS dedup engine (single place to reason about geo/time/country vetoes).
--   * For coord-less types (news/country/marketplace) p_lat/p_lng are NULL →
--     distance_m comes back NULL → the engine's geo guard is a no-op.
--   * p_exclude_id lets a re-embed of an existing row avoid matching itself; the
--     staging path passes NULL (the row has no entity id yet).

CREATE OR REPLACE FUNCTION public.find_semantic_duplicate_candidates(
  p_entity_type text,
  p_query_vec   extensions.vector,            -- 1024-d bge-m3 embedding of the item
  p_min_cosine  numeric DEFAULT 0.83,
  p_limit       int     DEFAULT 10,
  p_lat         numeric DEFAULT NULL,
  p_lng         numeric DEFAULT NULL,
  p_exclude_id  uuid    DEFAULT NULL
) RETURNS TABLE(entity_id uuid, match_type text, score numeric, distance_m double precision, country text, title text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
BEGIN
  -- Dynamic EXECUTE so each call gets a one-shot plan that uses the HNSW index
  -- for the ANN (a generic cached plan would seq-scan). `vnn` is the index-served
  -- nearest-neighbour pool over search_embeddings alone; we over-fetch (the type
  -- filter is applied only after the join) then keep the top p_limit of the type.
  RETURN QUERY EXECUTE $q$
    WITH vnn AS (
      SELECT se.doc_id, (se.embedding <=> $1) AS vdist
      FROM public.search_embeddings se
      WHERE se.embedding IS NOT NULL
      ORDER BY se.embedding <=> $1
      LIMIT greatest($4 * 20, 200)
    )
    SELECT sd.entity_id,
           'semantic'::text AS match_type,
           (1 - vnn.vdist)::numeric AS score,
           CASE WHEN $5 IS NOT NULL AND $6 IS NOT NULL AND sd.geog IS NOT NULL
                THEN extensions.ST_Distance(
                       sd.geog,
                       extensions.ST_SetSRID(extensions.ST_MakePoint($6::float8, $5::float8), 4326)::extensions.geography)
           END AS distance_m,
           sd.country,
           sd.title
    FROM vnn
    JOIN public.search_documents sd ON sd.doc_id = vnn.doc_id
    WHERE sd.entity_type = $2
      AND (1 - vnn.vdist) >= $3
      AND ($7 IS NULL OR sd.entity_id <> $7)
    ORDER BY vnn.vdist
    LIMIT greatest($4, 0)
  $q$
  USING p_query_vec, p_entity_type, p_min_cosine, p_limit, p_lat, p_lng, p_exclude_id;
END;
$function$;

COMMENT ON FUNCTION public.find_semantic_duplicate_candidates(text, extensions.vector, numeric, int, numeric, numeric, uuid)
  IS 'Generic embedding KNN dedup blocker over search_embeddings (HNSW cosine, ANN-first then filter). Returns entity ids + cosine + optional geo distance; conflict guards live in the TS dedup engine.';

GRANT EXECUTE ON FUNCTION public.find_semantic_duplicate_candidates(
  text, extensions.vector, numeric, int, numeric, numeric, uuid
) TO service_role;
