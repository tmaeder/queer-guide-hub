-- Self-refilling, gentle backfill of verdict + geo + tags onto the ~17k
-- already-live news articles that predate the pipeline fix (NULL
-- quality_pipeline_version). The fixed pipeline only heals fresh inflow + the
-- staging backlog; committed historical rows need this re-processing pass.
--
-- news-quality-backfill (extended) re-runs the quality LLM on a live article,
-- resolves country/city entities (disambiguation-guarded), writes
-- quality_status/relevance/sentiment/tags/country_ids/city_ids + junctions, and
-- snapshots the original first (reversible).
--
-- This cron tops up the job queue (next 1000 newest, only_missing) ONLY when
-- nearly drained — so it walks the whole corpus without duplicate jobs — then
-- runs a small sequential batch. Offset from the hourly pipeline (:00) and
-- orphan reclaim (:30); small batches keep CF Workers AI from overloading
-- (aggressive parallel enrichment returns garbage/unparseable).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='news_verdict_geo_backfill') THEN
    PERFORM cron.unschedule('news_verdict_geo_backfill');
  END IF;
END $$;
SELECT cron.schedule(
  'news_verdict_geo_backfill', '8,23,38,53 * * * *',
  $cron$
  DO $inner$
  DECLARE
    v_secret text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret');
    v_url text := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/news-quality-backfill';
    v_pending int;
  BEGIN
    SELECT count(*) INTO v_pending FROM public.quality_backfill_jobs WHERE dry_run=false AND status='pending';
    IF v_pending < 40 THEN
      PERFORM net.http_post(url := v_url,
        headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', v_secret),
        body := '{"action":"enqueue","limit":20000,"dry_run":false}'::jsonb);
    END IF;
    PERFORM net.http_post(url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', v_secret),
      body := '{"action":"run","batch_size":8,"dry_run":false}'::jsonb);
  END $inner$;
  $cron$
);
