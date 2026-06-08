-- Amenity Truth Engine — daily extract sweep.
-- Continuously mines existing tags/amenities/description of empty-amenities venues
-- into clean canonical slugs (free, no LLM). Bounded batch to keep the per-venue
-- search_documents re-index load modest. LLM/Places runs are deliberate, not cron'd.
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
      body := '{"sources":["extract"],"batch_limit":150}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$);
END $$;
