-- Source-quality regression alert: extends generate_data_ops_alerts() so that
-- a sustained drop in pipeline_quality_daily.score_p50 fires a
-- 'source_quality_drop' alert in data_ops_alerts.
--
-- Trigger: 7-day trailing p50 of a (source_name, entity_type) is >= 15 points
-- LOWER than the 30-day-prior baseline (8d..30d window), with at least 50
-- recent samples. Fingerprint dedupes per (source, entity, week-bucket).
--
-- This complements coverage_gap (volume) and dedup_precision_drift (matching)
-- with a "the data is getting worse" signal.

CREATE OR REPLACE FUNCTION public.generate_source_quality_alerts()
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  r RECORD;
BEGIN
  FOR r IN
    WITH recent AS (
      SELECT entity_type, source_name,
             percentile_cont(0.50) WITHIN GROUP (ORDER BY score_p50) AS p50_recent,
             SUM(n)::int AS n_recent
      FROM public.pipeline_quality_daily
      WHERE day >= (CURRENT_DATE - INTERVAL '7 days')
      GROUP BY entity_type, source_name
      HAVING SUM(n) >= 50
    ),
    baseline AS (
      SELECT entity_type, source_name,
             percentile_cont(0.50) WITHIN GROUP (ORDER BY score_p50) AS p50_baseline,
             SUM(n)::int AS n_baseline
      FROM public.pipeline_quality_daily
      WHERE day >= (CURRENT_DATE - INTERVAL '30 days')
        AND day <  (CURRENT_DATE - INTERVAL '8 days')
      GROUP BY entity_type, source_name
      HAVING SUM(n) >= 50
    )
    SELECT
      r.entity_type, r.source_name,
      r.p50_recent, b.p50_baseline,
      (b.p50_baseline - r.p50_recent) AS drop_points,
      r.n_recent, b.n_baseline
    FROM recent r
    JOIN baseline b USING (entity_type, source_name)
    WHERE (b.p50_baseline - r.p50_recent) >= 15
  LOOP
    INSERT INTO public.data_ops_alerts(alert_kind, severity, source_slug, detail, fingerprint)
    VALUES (
      'source_quality_drop',
      CASE WHEN r.drop_points >= 25 THEN 'error' ELSE 'warn' END,
      r.source_name,
      jsonb_build_object(
        'entity_type', r.entity_type,
        'p50_recent', r.p50_recent,
        'p50_baseline', r.p50_baseline,
        'drop_points', r.drop_points,
        'n_recent', r.n_recent,
        'n_baseline', r.n_baseline
      ),
      'qdrop:' || r.source_name || ':' || r.entity_type
        || ':' || to_char(date_trunc('week', now()), 'IYYY-IW')
    )
    ON CONFLICT (fingerprint) WHERE acked_at IS NULL DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_source_quality_alerts() TO service_role, authenticated;

-- Wire into the existing 30-min cron by chaining inside generate_data_ops_alerts.
-- We append a second cron entry rather than refactoring the existing function
-- (less risk to the existing alert flow). Run on the same cadence, offset by
-- 5 min to avoid contention.
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='source-quality-alerts';
  PERFORM cron.schedule('source-quality-alerts', '5,35 * * * *', $f$
    SELECT public.generate_source_quality_alerts();
  $f$);
END $$;
