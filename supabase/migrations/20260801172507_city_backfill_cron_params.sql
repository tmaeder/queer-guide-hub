-- Re-enable the city enrichment crons after the backfill window, with parameters
-- matched to the rewritten function.
--
-- batch_limit drops 120 -> 40: each city now costs up to five upstream requests
-- on first link (search + entity + summary + extract + labels) instead of one,
-- and 40 keeps a run inside the ~120s edge gateway budget. A new `sparql` job
-- picks up airports + universities, which need WDQS and are deliberately kept out
-- of the per-city loop (measured: HTTP 500 at 60s on transitive queries, a 502
-- under load, so it also gets its own circuit breaker).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'city_factual_backfill') THEN
    PERFORM cron.unschedule('city_factual_backfill');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'city_factual_sparql') THEN
    PERFORM cron.unschedule('city_factual_sparql');
  END IF;
END $$;

SELECT cron.schedule('city_factual_backfill', '15 3 * * *', $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/city-factual-backfill',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='city_quality_webhook_secret')
    ),
    body := '{"phase":"link","scope":"content_first","batch_limit":40}'::jsonb,
    timeout_milliseconds := 150000
  ) as request_id;
$cron$);

SELECT cron.schedule('city_factual_sparql', '40 3 * * *', $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/city-factual-backfill',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='city_quality_webhook_secret')
    ),
    body := '{"phase":"sparql","scope":"content_first","batch_limit":24}'::jsonb,
    timeout_milliseconds := 240000
  ) as request_id;
$cron$);

-- The agentic pass keeps its hourly cadence but no longer grows the city review
-- queue, which has had 692 items and no reviewer since 2026-06-28.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'city_agentic_enrich') THEN
    PERFORM cron.unschedule('city_agentic_enrich');
  END IF;
END $$;

SELECT cron.schedule('city_agentic_enrich', '20 * * * *', $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/city-agentic-enrich',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='city_quality_webhook_secret')
    ),
    body := '{"batch_limit": 5, "skip_gated": true}'::jsonb
  ) as request_id;
$cron$);
