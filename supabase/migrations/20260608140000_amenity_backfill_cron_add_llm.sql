-- Cheap fill: switch the daily amenity sweep from extract-only to extract+LLM.
-- extract cleans (free) for all 60; the LLM mines descriptions for amenities
-- (auto-applied >=0.8) and queues accessibility claims for admin review. The edge
-- function's own LLM daily-cap (80) bounds spend; batch 60 stays under it. Drains
-- the ~2,440 described-but-empty venues over ~6 weeks at trivial token cost.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='amenity_truth_backfill') THEN
    PERFORM cron.unschedule('amenity_truth_backfill');
  END IF;
  PERFORM cron.schedule('amenity_truth_backfill', '15 4 * * *', $cron$
    select net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/amenity-truth-backfill',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='amenity_quality_webhook_secret')
      ),
      body := '{"sources":["extract","llm"],"batch_limit":60}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$);
END $$;
