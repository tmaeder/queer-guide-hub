-- Orphan-reclaim sweep (final, gentle settings).
--
-- The executor's enrich/quality nodes filter staging by the current
-- pipeline_run_id, so rows that don't fully advance within their original run
-- become orphaned and never reprocess. This bounded cron calls the enrichment
-- stages with NO run_id filter so orphaned real-content rows drain gradually.
--
-- Deliberately GENTLE (batch 20/15, every 30 min, offset from the hourly
-- pipeline) to avoid overloading Cloudflare Workers AI — aggressive parallel
-- enrichment produced empty/garbage LLM responses ("unparseable"). Single
-- bounded batches succeed reliably.
--
-- NOTE: content-less stub rows (title only, no content/excerpt — pre full-text
-- extraction) are not enrichable and are bulk-marked enrichment_status='failed'
-- as a one-time cleanup; they are not committable (fail min-content validation).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='news_orphan_reclaim') THEN
    PERFORM cron.unschedule('news_orphan_reclaim');
  END IF;
END $$;
SELECT cron.schedule(
  'news_orphan_reclaim', '30 * * * *',
  $cron$
  SELECT
    net.http_post(url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-enrich-news',
      headers := jsonb_build_object('Content-Type','application/json',
        'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
      body := '{"batch_size":20,"concurrency":3}'::jsonb),
    net.http_post(url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-quality-enhance',
      headers := jsonb_build_object('Content-Type','application/json',
        'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
      body := '{"batch_size":15,"concurrency":3}'::jsonb);
  $cron$
);

-- One-time backlog cleanup: retire content-less title-only stubs.
UPDATE public.ingestion_staging
SET enrichment_status='failed',
    error_message=coalesce(error_message,'')||' | content-less stub (pre-fulltext-extraction); not enrichable',
    updated_at=now()
WHERE target_table='news_articles'
  AND enrichment_status='pending'
  AND length(coalesce(normalized_data->>'content',''))=0
  AND length(coalesce(normalized_data->>'excerpt',''))=0;
