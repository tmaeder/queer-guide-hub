-- city_quality_signals is append-only and will grow unbounded (one row per city per
-- scored signal per run). On a disk-constrained DB this is the same failure mode that
-- bloated cron.job_run_details to 311 MB. Daily prune: 90-day retention, but always keep
-- the latest row per (city, signal_type) so the recompute's DISTINCT ON reads still work.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='prune_city_signals') THEN
    PERFORM cron.unschedule('prune_city_signals');
  END IF;
END $$;

SELECT cron.schedule(
  'prune_city_signals',
  '20 2 * * *',
  $cron$
  DELETE FROM public.city_quality_signals s
  WHERE s.created_at < now() - interval '90 days'
    AND s.id NOT IN (
      SELECT DISTINCT ON (city_id, signal_type) id
      FROM public.city_quality_signals
      ORDER BY city_id, signal_type, created_at DESC
    );
  $cron$
);
