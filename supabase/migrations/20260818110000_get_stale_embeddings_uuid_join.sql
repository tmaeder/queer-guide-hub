-- get_stale_embeddings: the old body cast content_embeddings.content_id (uuid)
-- to text to join against the candidates' text ids, which defeated the UNIQUE
-- index (content_type, content_id). Called every minute by workers/ingest's
-- scheduled drain, it averaged 1.4 s and hit the 8 s authenticator timeout
-- (53 h of DB time since 2026-05-03). Candidates now keep uuid ids and the
-- join is uuid = uuid; ids are cast to text only in the final projection.
-- Measured: 472 ms cold (was timeout-prone). Body otherwise identical to the
-- live function (lifted via pg_get_functiondef, per the search_hybrid
-- CREATE-OR-REPLACE-on-stale-body lesson).
CREATE OR REPLACE FUNCTION public.get_stale_embeddings(p_limit integer DEFAULT 200)
 RETURNS TABLE(table_name text, id text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT 'venues'::text AS table_name, v.id AS id, v.updated_at, 'venue'::text AS content_type
    FROM venues v
    UNION ALL
    SELECT 'events',            e.id,  e.updated_at,  'event'        FROM events e
    UNION ALL
    SELECT 'cities',            c.id,  c.updated_at,  'city'         FROM cities c
    UNION ALL
    SELECT 'countries',         co.id, co.updated_at, 'country'      FROM countries co
    UNION ALL
    SELECT 'personalities',     p.id,  p.updated_at,  'personality'  FROM personalities p
    UNION ALL
    SELECT 'news_articles',     n.id,  n.updated_at,  'news'         FROM news_articles n
    UNION ALL
    SELECT 'marketplace_listings', m.id, m.updated_at, 'marketplace' FROM marketplace_listings m
    UNION ALL
    SELECT 'queer_villages',    q.id,  q.updated_at,  'queer_village' FROM queer_villages q
    UNION ALL
    SELECT 'unified_tags',      t.id,  t.updated_at,  'tag'          FROM unified_tags t
    UNION ALL
    SELECT 'milestones',        ms.id, ms.updated_at, 'milestone'    FROM milestones ms
    WHERE ms.status = 'published' AND ms.duplicate_of_id IS NULL
    UNION ALL
    SELECT 'guides',            g.id,  g.updated_at,  'guide'        FROM guides g
    WHERE g.status = 'published'
  )
  SELECT cand.table_name, cand.id::text, cand.updated_at
  FROM candidates cand
  LEFT JOIN content_embeddings ce
    ON ce.content_type = cand.content_type
   AND ce.content_id = cand.id
  WHERE ce.embedding IS NULL OR ce.updated_at < cand.updated_at
  ORDER BY cand.updated_at DESC NULLS LAST
  LIMIT p_limit;
$function$;
