-- ============================================================
-- P2 + P3: Consolidate duplicates, stagger crons, add monitoring
-- Context: After P0/P1 shut down broken jobs, consolidate remaining
-- duplicate variants, prevent run overlaps via max_concurrency=1 on
-- singleton pipelines, stagger daily crons to avoid thundering herd,
-- and install a pipeline-health checker that alerts on DLQ growth
-- and consecutive failures.
-- ============================================================

-- 1. Deprecate per-entity Wolfram enrichers. The parametrized
--    `enrich_entity` workflow (already enabled, queue=enrichment_queue)
--    handles city/country/tag via payload. Keep the old rows for
--    audit but disable and point callers at enrich_entity.
UPDATE public.workflow_definitions
SET is_enabled = false,
    description = COALESCE(description, '') ||
      E'\n[2026-04-20] Deprecated: use `enrich_entity` with ' ||
      '{"content_type":"city|country|tag","limit":N}.',
    updated_at = now()
WHERE name IN ('enrich-wolfram-cities','enrich-wolfram-countries','enrich-wolfram-tags')
  AND is_enabled = true;

-- 2. Deprecate redundant event scraper variants. `bulk-scrape-events`
--    becomes the single manual entry point; `scrape-events-daily`
--    remains as the cron trigger. Remove single-source variants.
UPDATE public.workflow_definitions
SET is_enabled = false,
    description = COALESCE(description, '') ||
      E'\n[2026-04-20] Deprecated: use `bulk-scrape-events` ' ||
      'with {"source":"gaycities"} or `scrape-events-daily` cron.',
    updated_at = now()
WHERE name = 'scrape-gaycities-events'
  AND is_enabled = true;

-- 3. Singleton pipelines: max_concurrency=1 so a long-running instance
--    blocks new dispatches instead of stacking duplicate runs that
--    race on the same staging tables.
UPDATE public.pipeline_definitions
SET max_concurrency = 1, updated_at = now()
WHERE name IN (
  'news-ingestion',
  'marketplace-ingestion',
  'personality-ingestion',
  'hotel-ingestion-pipeline',
  'events-ingestion-bulletproof'
) AND max_concurrency <> 1;

-- 4. Stagger daily cron collisions. After P1 the 03:00 slot still has
--    wf-run-automated-reviews + Sunday-only wf-scrape-web-sources.
--    Move reviews to :15, web scrape to :45 — same hour, no overlap.
DO $$
DECLARE
  v_jobs TEXT[] := ARRAY[
    'wf-run-automated-reviews', '15 3 * * *',
    'wf-scrape-web-sources',    '45 3 * * 0'
  ];
  v_jobid BIGINT;
  i INT;
BEGIN
  FOR i IN 1..array_length(v_jobs, 1) BY 2 LOOP
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = v_jobs[i];
    IF v_jobid IS NOT NULL THEN
      PERFORM cron.alter_job(job_id := v_jobid, schedule := v_jobs[i + 1]);
    END IF;
  END LOOP;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 5. Pipeline-health alerts: table of open incidents. Rows close
--    automatically when the condition clears.
CREATE TABLE IF NOT EXISTS public.pipeline_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('dead_letter_backlog','consecutive_failures','stuck_run')),
  subject TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.pipeline_health_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_health_alerts_select" ON public.pipeline_health_alerts;
CREATE POLICY "pipeline_health_alerts_select" ON public.pipeline_health_alerts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "pipeline_health_alerts_admin_all" ON public.pipeline_health_alerts;
CREATE POLICY "pipeline_health_alerts_admin_all" ON public.pipeline_health_alerts
  FOR ALL USING (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_health_alerts_open
  ON public.pipeline_health_alerts(kind, subject)
  WHERE resolved_at IS NULL;

-- 6. Health-check function: opens/closes alerts for DLQ backlog,
--    pipelines with 2+ consecutive failures, and any run running
--    beyond its timeout (belt-and-braces next to the P0 reaper).
CREATE OR REPLACE FUNCTION public.check_pipeline_health()
RETURNS TABLE(opened INT, resolved INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dlq_len INT;
  v_opened INT := 0;
  v_resolved INT := 0;
  v_threshold INT := 500;
BEGIN
  -- dead_letter backlog
  SELECT queue_length INTO v_dlq_len
    FROM public.pgmq_metrics('dead_letter');

  IF v_dlq_len > v_threshold THEN
    INSERT INTO public.pipeline_health_alerts (kind, subject, detail)
    VALUES ('dead_letter_backlog', 'dead_letter',
            jsonb_build_object('queue_length', v_dlq_len, 'threshold', v_threshold))
    ON CONFLICT (kind, subject) WHERE resolved_at IS NULL DO UPDATE
      SET detail = EXCLUDED.detail, last_seen_at = now();
    v_opened := v_opened + 1;
  ELSE
    UPDATE public.pipeline_health_alerts
      SET resolved_at = now()
      WHERE kind = 'dead_letter_backlog' AND subject = 'dead_letter'
        AND resolved_at IS NULL;
    GET DIAGNOSTICS v_resolved = ROW_COUNT;
  END IF;

  -- Consecutive failures per pipeline (last 5 runs, all failed)
  WITH recent AS (
    SELECT pipeline_name,
           array_agg(status ORDER BY created_at DESC) FILTER (WHERE rn <= 5) AS last_5
    FROM (
      SELECT pipeline_name, status, created_at,
             row_number() OVER (PARTITION BY pipeline_name ORDER BY created_at DESC) AS rn
      FROM public.pipeline_runs
      WHERE created_at > now() - INTERVAL '2 days'
    ) s
    WHERE rn <= 5
    GROUP BY pipeline_name
  ),
  bad AS (
    SELECT pipeline_name, last_5 FROM recent
    WHERE array_length(last_5, 1) >= 2
      AND NOT ('completed' = ANY(last_5))
  ),
  ins AS (
    INSERT INTO public.pipeline_health_alerts (kind, subject, detail)
    SELECT 'consecutive_failures', pipeline_name,
           jsonb_build_object('recent_statuses', to_jsonb(last_5))
    FROM bad
    ON CONFLICT (kind, subject) WHERE resolved_at IS NULL DO UPDATE
      SET detail = EXCLUDED.detail, last_seen_at = now()
    RETURNING 1
  )
  SELECT v_opened + count(*) INTO v_opened FROM ins;

  -- Auto-resolve any consecutive_failures alerts whose pipeline
  -- has since completed successfully.
  WITH recovered AS (
    UPDATE public.pipeline_health_alerts a
    SET resolved_at = now()
    FROM public.pipeline_runs r
    WHERE a.kind = 'consecutive_failures'
      AND a.resolved_at IS NULL
      AND r.pipeline_name = a.subject
      AND r.status = 'completed'
      AND r.created_at > a.first_seen_at
    RETURNING 1
  )
  SELECT v_resolved + count(*) INTO v_resolved FROM recovered;

  RETURN QUERY SELECT v_opened, v_resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.check_pipeline_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_pipeline_health() TO service_role;

-- 7. Schedule health check every 15 minutes.
DO $$
BEGIN
  PERFORM cron.unschedule('check-pipeline-health')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-pipeline-health');
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

SELECT cron.schedule(
  'check-pipeline-health',
  '*/15 * * * *',
  $cron$SELECT public.check_pipeline_health();$cron$
);

-- 8. Seed an initial health snapshot so the table is not empty.
SELECT public.check_pipeline_health();
