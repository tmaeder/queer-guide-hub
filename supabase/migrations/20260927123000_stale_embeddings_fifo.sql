-- Embedding backlog: make get_stale_embeddings a QUEUE instead of a LIFO peek,
-- and give the drain a sentinel.
--
-- `workers/ingest` is the only writer of 1024-dim vectors into
-- content_embeddings (which feeds search_embeddings, the vector arm of
-- search_hybrid). Its wrangler.toml called the `*/10` cron a "backstop" for a
-- Supabase DB webhook and said "the webhook remains the fast path". THAT
-- WEBHOOK DOES NOT EXIST — measured 2026-08-23, zero triggers on any table
-- reach net.http_request:
--
--   select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
--   where not t.tgisinternal and pg_get_triggerdef(t.oid) ilike '%http_request%';
--   -- 0
--
-- So the "backstop" is the ONLY path, for all eleven entity types, and it was
-- sized as one: 15 rows per run × 144 runs = 2,160 rows/day for the whole
-- platform.
--
-- The ordering is what turned an under-provisioned queue into a starving one.
-- `ORDER BY cand.updated_at DESC` serves the NEWEST dirty rows first, so under
-- continuous churn (news re-sanitize runs */5, the nightly backfills rewrite
-- 300-1500 rows a pass) the tail is never reached at all — it is starvation,
-- not a queue that drains slowly. Measured consequence: 6,209 active
-- marketplace_listings with a missing or stale embedding, freshly imported rows
-- landing as deep as position ~2,900, i.e. 30+ hours out. They are
-- keyword-searchable and vector-invisible, so semantic and related-item queries
-- silently miss them — verified live during a dancesafe.org import, where
-- "DanceSafe" returned the rows and "xylazine test strip" returned apparel.
--
-- Two changes here, one in the worker (batched drain, larger batch, */5 cron):
--
-- 1. ORDER BY (embedding IS NULL) DESC, updated_at ASC — never-embedded ahead
--    of merely-stale (a missing vector is invisibility, a stale one is only
--    drift), then FIFO on the moment the row became dirty. FIFO is what makes
--    the backlog bounded: a row that keeps being rewritten keeps moving to the
--    BACK, so churn can no longer outrun the tail. The cost is that a brand-new
--    row now waits behind the backlog rather than jumping it; with the worker's
--    new throughput that is minutes once the 6.2k has cleared, and unbounded
--    invisibility is the worse failure.
--
-- 2. get_stale_embedding_backlog() — there was no health check on this path at
--    all, which is why an 11-entity-type index gap sat unnoticed. Consumed by
--    scripts/check-pipeline-health.mjs.
--
-- The candidate set moves into a view both functions read, so the sentinel
-- cannot drift from what the drain actually selects. A sentinel measuring a
-- slightly different set than the worker drains is how a starving queue reads
-- clean.
--
-- The get_stale_embeddings body is otherwise lifted verbatim from
-- 20260818110000 (the latest migration defining it) — per the
-- search_hybrid CREATE-OR-REPLACE-on-a-stale-body lesson, only the ORDER BY and
-- the candidate source change.

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared candidate set. security_invoker is stated explicitly: CREATE OR
-- REPLACE VIEW silently resets it to definer, and both readers below are
-- SECURITY DEFINER functions owned by postgres anyway.
CREATE OR REPLACE VIEW public.embedding_candidates
WITH (security_invoker = true) AS
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
  WHERE g.status = 'published';

COMMENT ON VIEW public.embedding_candidates IS
  'Every row workers/ingest is expected to hold a content_embeddings vector for. '
  'Read by get_stale_embeddings (what the drain works on) and '
  'get_stale_embedding_backlog (what the health check measures) so the two '
  'cannot disagree about the denominator.';

REVOKE ALL ON public.embedding_candidates FROM PUBLIC;
REVOKE ALL ON public.embedding_candidates FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_stale_embeddings(p_limit integer DEFAULT 200)
 RETURNS TABLE(table_name text, id text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cand.table_name, cand.id::text, cand.updated_at
  FROM embedding_candidates cand
  LEFT JOIN content_embeddings ce
    ON ce.content_type = cand.content_type
   AND ce.content_id = cand.id
  WHERE ce.embedding IS NULL OR ce.updated_at < cand.updated_at
  -- Never-embedded first, then oldest-dirty-first. NULLS LAST keeps rows with
  -- no updated_at at all from permanently owning the head of the queue.
  ORDER BY (ce.embedding IS NULL) DESC, cand.updated_at ASC NULLS LAST, cand.id
  LIMIT p_limit;
$function$;

COMMENT ON FUNCTION public.get_stale_embeddings(integer) IS
  'FIFO work list for the workers/ingest embedding drain: rows with no vector '
  'first, then oldest-dirty-first. The ordering is load-bearing — DESC starved '
  'the tail indefinitely under continuous churn (6,209 marketplace rows, 2026-08).';

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_stale_embedding_backlog()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH dirty AS (
    SELECT cand.table_name,
           (ce.embedding IS NULL) AS missing,
           cand.updated_at
    FROM embedding_candidates cand
    LEFT JOIN content_embeddings ce
      ON ce.content_type = cand.content_type
     AND ce.content_id = cand.id
    WHERE ce.embedding IS NULL OR ce.updated_at < cand.updated_at
  )
  SELECT jsonb_build_object(
    'missing', coalesce(
      (SELECT jsonb_object_agg(table_name, n)
         FROM (SELECT table_name, count(*) AS n FROM dirty WHERE missing GROUP BY 1) s),
      '{}'::jsonb),
    'stale', coalesce(
      (SELECT jsonb_object_agg(table_name, n)
         FROM (SELECT table_name, count(*) AS n FROM dirty WHERE NOT missing GROUP BY 1) s),
      '{}'::jsonb),
    'total_missing', (SELECT count(*) FROM dirty WHERE missing),
    'total_stale',   (SELECT count(*) FROM dirty WHERE NOT missing),
    -- Head-of-queue age. With FIFO ordering this is the actual worst-case wait,
    -- which depth alone cannot tell you: a healthy drain working through a
    -- backfill is legitimately deep, a dead one on a quiet day never is.
    'oldest_dirty_at', (SELECT min(updated_at) FROM dirty),
    -- Liveness. The worker keeps no run log of its own, and this needs none:
    -- workers/ingest is the sole writer of content_embeddings, so the newest row
    -- there IS the last time the drain did any work. A backlog that is not
    -- moving while this timestamp stands still is a dead drain — which is the
    -- failure that has to fail the build, since depth alone cannot distinguish
    -- a healthy drain working through an import from a dead one on a quiet day.
    'last_embedded_at', (SELECT max(updated_at) FROM content_embeddings)
  );
$function$;

COMMENT ON FUNCTION public.get_stale_embedding_backlog() IS
  'Depth + head-of-queue age of the workers/ingest embedding drain, per source '
  'table. Read by scripts/check-pipeline-health.mjs; there was no check on this '
  'path before 2026-08.';

REVOKE ALL ON FUNCTION public.get_stale_embedding_backlog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_stale_embedding_backlog() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stale_embedding_backlog() TO service_role;
