-- Unified Guides: include guides in the embedding drain.
--
-- Guides are in search_documents but had NO vector — get_stale_embeddings()
-- (drained by the workers/ingest cron → content_embeddings → bridge →
-- search_embeddings) never selected them, so the hybrid search vector arm
-- couldn't see them. Body = live definition + the guides branch (published
-- only; safety-gated rows are still filtered at query time via
-- search_documents.safety_gated).

CREATE OR REPLACE FUNCTION public.get_stale_embeddings(p_limit integer DEFAULT 200)
RETURNS TABLE (table_name text, id text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT 'venues'::text AS table_name, v.id::text AS id, v.updated_at, 'venue'::text AS content_type
    FROM venues v
    UNION ALL
    SELECT 'events',            e.id::text, e.updated_at, 'event'        FROM events e
    UNION ALL
    SELECT 'cities',            c.id::text, c.updated_at, 'city'         FROM cities c
    UNION ALL
    SELECT 'countries',         co.id::text, co.updated_at, 'country'    FROM countries co
    UNION ALL
    SELECT 'personalities',     p.id::text, p.updated_at, 'personality'  FROM personalities p
    UNION ALL
    SELECT 'news_articles',     n.id::text, n.updated_at, 'news'         FROM news_articles n
    UNION ALL
    SELECT 'marketplace_listings', m.id::text, m.updated_at, 'marketplace' FROM marketplace_listings m
    UNION ALL
    SELECT 'queer_villages',    q.id::text, q.updated_at, 'queer_village' FROM queer_villages q
    UNION ALL
    SELECT 'unified_tags',      t.id::text, t.updated_at, 'tag'          FROM unified_tags t
    UNION ALL
    SELECT 'milestones',        ms.id::text, ms.updated_at, 'milestone'  FROM milestones ms
    WHERE ms.status = 'published' AND ms.duplicate_of_id IS NULL
    UNION ALL
    SELECT 'guides',            g.id::text, g.updated_at, 'guide'        FROM guides g
    WHERE g.status = 'published'
  )
  SELECT cand.table_name, cand.id, cand.updated_at
  FROM candidates cand
  LEFT JOIN content_embeddings ce
    ON ce.content_type = cand.content_type
   AND ce.content_id::text = cand.id
  WHERE ce.embedding IS NULL OR ce.updated_at < cand.updated_at
  ORDER BY cand.updated_at DESC NULLS LAST
  LIMIT p_limit;
$$;
