-- ============================================================================
-- Marketplace staging drain: boost relevance cadence + classification propagate
-- ----------------------------------------------------------------------------
-- 1) The relevance LLM gate ground the ~10k orphaned staging backlog at
--    800/day (2 ticks/hour x batch 40, cap 800). Boost to 8 ticks/hour and
--    daily_cap 4000 so the backlog drains in ~2-3 days instead of ~2 weeks.
--    Steady-state (new products only) stays far below the cap; LLM is CF
--    Workers AI llama — spend bounded by the cap.
-- 2) mp-drain-propagate: rows that were committed to marketplace_listings
--    BEFORE classification (gate-bypass bug fixed in
--    20260713195608_marketplace_commit_classification_gate) get their
--    later-arriving classification synced from staging onto the live listing;
--    relevance-rejected ones are deactivated. Pure SQL, 200/hour (bounded so
--    the search_documents trigger never storms), idles at no-op once drained.
--
-- Applied live 2026-07-13 via MCP apply_migration (version 20260713200030);
-- this file matches the stamped remote version so CI `db push` skips it.
-- ============================================================================

DO $$ BEGIN
  PERFORM cron.unschedule(j) FROM unnest(ARRAY[
    'mp-drain-relevance-fresh','mp-drain-relevance-backlog','mp-drain-propagate'
  ]) j WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('mp-drain-relevance-fresh', '10,25,40,55 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-relevance',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"order":"newest","daily_cap":4000,"batch_size":40}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('mp-drain-relevance-backlog', '0,15,30,45 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-relevance',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"order":"oldest","daily_cap":4000,"batch_size":40}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);

-- Sync late-arriving staging classification onto listings committed unclassified.
SELECT cron.schedule('mp-drain-propagate', '50 * * * *', $$
  WITH cand AS (
    SELECT DISTINCT ON (s.target_record_id)
           s.target_record_id AS lid,
           s.classification_result AS c,
           s.disposition
      FROM public.ingestion_staging s
      JOIN public.marketplace_listings l ON l.id = s.target_record_id
     WHERE s.entity_type = 'marketplace'
       AND s.classification_result IS NOT NULL
       AND s.target_record_id IS NOT NULL
       AND l.lgbti_relevance_score IS NULL
     ORDER BY s.target_record_id, s.updated_at DESC
     LIMIT 200
  )
  UPDATE public.marketplace_listings l SET
    lgbti_relevance_score = nullif(cand.c->>'lgbti_relevance_score','')::numeric,
    sensitivity_flags     = coalesce(cand.c->'sensitivity_flags','[]'::jsonb),
    classified_at         = now(),
    status                = CASE WHEN cand.disposition = 'rejected' THEN 'inactive' ELSE l.status END,
    updated_at            = now()
  FROM cand
  WHERE l.id = cand.lid;
$$);
