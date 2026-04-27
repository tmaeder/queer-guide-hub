-- Multilingual upgrade: switch from bge-base-en (768d, EN) to bge-m3 (1024d, multilingual).
--
-- WARNING: Destructive. All existing embeddings (~13k) become invalid. Recompute via backfill.sh.
--
-- Order of operations:
--   1. Run this script.
--   2. Deploy workers with EMBED_MODEL = "@cf/baai/bge-m3".
--   3. Clear KV embed cache: wrangler kv:key delete --binding=EMBED_CACHE "*"
--   4. Run: scripts/backfill.sh (full rebuild)
--   5. Update Meili embedder dimensions to 1024 and re-index Meili too.

BEGIN;

-- Drop dependent index before column type change.
DROP INDEX IF EXISTS public.content_embeddings_embedding_hnsw;

-- Null out old embeddings (keep rows, drop vectors).
UPDATE public.content_embeddings SET embedding = NULL;

-- Change column dimension.
ALTER TABLE public.content_embeddings
  ALTER COLUMN embedding TYPE extensions.vector(1024);

-- Recreate HNSW index at new dim.
CREATE INDEX content_embeddings_embedding_hnsw
  ON public.content_embeddings
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Update RPC signatures.
DROP FUNCTION IF EXISTS public.personalized_semantic_search(
  extensions.vector(768), extensions.vector(768), real, text[], int);
DROP FUNCTION IF EXISTS public.get_bias_signal(uuid, text, int);

CREATE OR REPLACE FUNCTION public.personalized_semantic_search(
  p_query_vec extensions.vector(1024),
  p_bias_vec extensions.vector(1024) DEFAULT NULL,
  p_bias_weight real DEFAULT 0.3,
  p_content_types text[] DEFAULT NULL,
  p_limit int DEFAULT 100
) RETURNS TABLE (
  content_type text,
  content_id uuid,
  score real,
  metadata jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_combined extensions.vector(1024);
BEGIN
  IF p_bias_vec IS NOT NULL THEN
    v_combined := ((1.0 - p_bias_weight) * p_query_vec + p_bias_weight * p_bias_vec);
  ELSE
    v_combined := p_query_vec;
  END IF;

  RETURN QUERY
  SELECT ce.content_type, ce.content_id,
         (1.0 - (ce.embedding <=> v_combined))::real AS score,
         ce.metadata
  FROM content_embeddings ce
  WHERE (p_content_types IS NULL OR ce.content_type = ANY(p_content_types))
    AND ce.embedding IS NOT NULL
  ORDER BY ce.embedding <=> v_combined
  LIMIT p_limit;
END $$;

CREATE OR REPLACE FUNCTION public.get_bias_signal(
  p_user_id uuid DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_window int DEFAULT 30
) RETURNS TABLE (
  entity_type text,
  entity_id text,
  event_type text,
  age_days real,
  embedding extensions.vector(1024)
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH ev AS (
    SELECT ue.entity_type, ue.entity_id, ue.event_type, ue.created_at
    FROM user_events ue
    WHERE (p_user_id IS NOT NULL AND ue.user_id = p_user_id)
       OR (p_user_id IS NULL AND ue.session_id = p_session_id)
    ORDER BY ue.created_at DESC
    LIMIT p_window
  )
  SELECT ev.entity_type, ev.entity_id, ev.event_type,
         EXTRACT(EPOCH FROM (now() - ev.created_at))::real / 86400.0 AS age_days,
         ce.embedding
  FROM ev
  JOIN content_embeddings ce
    ON ce.content_type = ev.entity_type
   AND ce.content_id::text = ev.entity_id
  WHERE ce.embedding IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.personalized_semantic_search TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_bias_signal TO authenticated, service_role;

COMMIT;
