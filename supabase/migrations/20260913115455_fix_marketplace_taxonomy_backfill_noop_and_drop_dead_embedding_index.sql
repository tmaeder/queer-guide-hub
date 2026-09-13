-- Fix run_marketplace_taxonomy_backfill: it self-assigned `subcategory` to its
-- own value and never stamped `taxonomy_v3_at`, so the same lowest-id batch
-- was re-selected and no-op'd every run forever. The no-op UPDATE still fired
-- every unconditional trigger on marketplace_listings (search reindex via
-- trg_search_documents_marketplace, trg_marketplace_listings_aa_derive,
-- trg_marketplace_listings_slug, sanitize_website_before_upsert) on up to 200
-- rows on a `* * * * *` cron -- ~288k wasted trigger-firing writes/day with no
-- effect on the backlog. This fix stamps the flag so the batch actually
-- converges; it does not add real taxonomy-classification logic (no source
-- of truth for what subcategory values should be was available) -- if
-- `subcategory` needs recomputing beyond what commit/dedup already wrote,
-- that is separate follow-up work.
CREATE OR REPLACE FUNCTION public.run_marketplace_taxonomy_backfill(p_batch integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_updated integer := 0;
  v_remaining bigint;
BEGIN
  WITH pending AS (
    SELECT l.id
    FROM public.marketplace_listings l
    WHERE l.taxonomy_v3_at IS NULL
    ORDER BY l.id
    LIMIT GREATEST(1, LEAST(p_batch, 200))
  )
  UPDATE public.marketplace_listings m
  SET taxonomy_v3_at = now()
  FROM pending p
  WHERE m.id = p.id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM public.marketplace_listings l WHERE l.taxonomy_v3_at IS NULL;

  RETURN jsonb_build_object('updated', v_updated, 'remaining', v_remaining, 'at', now());
END $function$;

-- It also ran on a `* * * * *` cron regardless of whether there was ever work
-- to do (every other batch backfill in admin_automations runs daily). Now
-- that the batch can actually converge, move it to the same daily cadence.
-- Both the registry row AND the live pg_cron job must be updated -- per this
-- repo's own documented history, sync_automations_to_cron() only creates a
-- MISSING cron job from the registry command; it does not correct a
-- schedule/command drift on an already-existing job (see the
-- detect-stale-venues incident in CLAUDE.md).
UPDATE public.admin_automations
SET schedule = '20 5 * * *'
WHERE slug = 'marketplace_taxonomy_backfill';

SELECT cron.alter_job(
  job_id => (SELECT jobid FROM cron.job WHERE jobname = 'marketplace_taxonomy_backfill'),
  schedule => '20 5 * * *'
);

-- Drop the never-used HNSW vector index on content_embeddings. search_hybrid's
-- vector arm reads search_embeddings, not content_embeddings directly (see
-- CLAUDE.md "The vectors themselves come from ONE cron"). Confirmed live
-- 2026-09-07 and 2026-09-13: content_embeddings_embedding_hnsw carried 0 then
-- 1 lifetime scans (stats never reset since project creation) while
-- search_embeddings_hnsw logged >56k new scans in the same 6-day window. It
-- costs ~2GB on a disk-constrained DB and adds real per-row write cost
-- (HNSW graph maintenance) to the embedding drain (workers/ingest, up to
-- ~57,600 upserts/day) for zero benefit. Definition preserved here in case it
-- is ever needed again:
--   CREATE INDEX content_embeddings_embedding_hnsw ON public.content_embeddings
--     USING hnsw (embedding vector_cosine_ops) WITH (m='16', ef_construction='64');
DROP INDEX IF EXISTS public.content_embeddings_embedding_hnsw;

-- Re-assert the conditions above so a future change to either job silently
-- regresses this fix rather than passing quietly.
DO $verify$
DECLARE
  v_schedule text;
  v_live_schedule text;
BEGIN
  SELECT schedule INTO v_schedule FROM public.admin_automations WHERE slug = 'marketplace_taxonomy_backfill';
  IF v_schedule IS DISTINCT FROM '20 5 * * *' THEN
    RAISE EXCEPTION 'marketplace_taxonomy_backfill registry schedule drifted: %', v_schedule;
  END IF;

  SELECT schedule INTO v_live_schedule FROM cron.job WHERE jobname = 'marketplace_taxonomy_backfill';
  IF v_live_schedule IS DISTINCT FROM '20 5 * * *' THEN
    RAISE EXCEPTION 'marketplace_taxonomy_backfill live cron schedule drifted: %', v_live_schedule;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'content_embeddings_embedding_hnsw') THEN
    RAISE EXCEPTION 'content_embeddings_embedding_hnsw still exists after DROP INDEX';
  END IF;
END $verify$;
