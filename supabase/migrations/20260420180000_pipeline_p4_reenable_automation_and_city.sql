-- ============================================================
-- P4: Re-enable automation-* crons and city-ingestion
-- Context: P1 paused 8 automation-* crons failing with "Invalid
-- authorization". Root cause: content-automation (the edge_function
-- behind every automation-* workflow) called requireAdmin() which
-- rejects the service-role token dispatcher sends. Fixed in
-- supabase/functions/content-automation/index.ts — now accepts the
-- service-role key as a system/internal call. Verified manually:
-- one test run completed 2026-04-20 12:24 UTC with no error.
--
-- Also re-add city-ingestion cron now that source-csv-upload no
-- longer throws when fileUrl is absent (it no-ops and returns []).
-- Country-ingestion stays off until Wolfram Alpha creds rotate.
-- ============================================================

-- 1. Re-schedule automation-* crons. Staggered within the hour to
--    spread dispatcher load. All go to import_jobs queue since that
--    is the queue_name on every automation workflow definition.
DO $$
DECLARE
  v_jobs TEXT[][] := ARRAY[
    ARRAY['wf-automation-auto-tagger',        '5 5 * * *'],
    ARRAY['wf-automation-content-classifier', '10 5 * * *'],
    ARRAY['wf-automation-content-validator',  '15 5 * * *'],
    ARRAY['wf-automation-data-normalizer',    '20 5 * * *'],
    ARRAY['wf-automation-dedup-checker',      '25 5 * * *'],
    ARRAY['wf-automation-event-validator',    '30 5 * * *'],
    ARRAY['wf-automation-geo-enricher',       '35 5 * * *'],
    ARRAY['wf-automation-link-sanitizer',     '40 5 * * *']
  ];
  v_row TEXT[];
  v_wf  TEXT;
BEGIN
  FOREACH v_row SLICE 1 IN ARRAY v_jobs LOOP
    -- Derive workflow name from job name (strip 'wf-' prefix).
    v_wf := regexp_replace(v_row[1], '^wf-', '');
    PERFORM cron.schedule(
      v_row[1],
      v_row[2],
      format(
        $fmt$SELECT pgmq_send('import_jobs', jsonb_build_object(
          'workflow', %L, 'triggered_by', 'cron'));$fmt$,
        v_wf
      )
    );
  END LOOP;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 2. Re-add city-ingestion cron. source-csv-upload now no-ops on
--    missing fileUrl so the DAG completes from the GeoNames branch.
DO $$
BEGIN
  PERFORM cron.unschedule('pipeline-city-ingestion')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pipeline-city-ingestion');
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

SELECT cron.schedule(
  'pipeline-city-ingestion',
  '7 * * * *',
  $cron$
    SELECT pgmq_send('pipeline_steps', jsonb_build_object(
      'workflow', 'pipeline-executor',
      'triggered_by', 'cron',
      'pipeline_name', 'city-ingestion'
    ));
  $cron$
);

-- 3. Restore schedule metadata on pipeline_definitions.city-ingestion.
UPDATE public.pipeline_definitions
SET schedule = '7 * * * *',
    description = COALESCE(description, '') ||
      E'\n[2026-04-20] Re-enabled: source-csv-upload patched to no-op ' ||
      'when fileUrl is absent. Cron restored.',
    updated_at = now()
WHERE name = 'city-ingestion';
