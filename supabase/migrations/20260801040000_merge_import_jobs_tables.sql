-- ============================================================================
-- Ingestion unification P2.2 — one job-tracking table
-- ----------------------------------------------------------------------------
-- Two parallel job trackers existed: the legacy `import_jobs` (16 rows, no
-- user attribution, workflow-era statuses) and `import_jobs_enhanced` (the
-- table every current writer/reader uses: useImportHub*, ingest fns).
-- Keep `import_jobs_enhanced` as the only table:
--   1. Backfill the legacy rows into import_jobs_enhanced (id preserved,
--      heuristic type/status mapping; raw legacy values kept verbatim in
--      import_summary so nothing is lost).
--   2. Drop the legacy table (+ its dedicated updated_at trigger fn).
--   3. Recreate `import_jobs` as a compatibility VIEW over
--      import_jobs_enhanced (security_invoker → enhanced RLS applies) for
--      any reader not migrated in this pass. Known readers
--      (useAdminCockpit, useCockpitRealtime) are migrated to
--      import_jobs_enhanced in the same change.
-- NOTE: 'import_jobs' also names a pgmq QUEUE (workflow-dispatcher) — the
-- queue is unrelated to this table and untouched.
-- ============================================================================

-- ── 1. Backfill legacy rows (16 rows — far below the 500/batch cap) ─────────
INSERT INTO public.import_jobs_enhanced (
  id, user_id, type, source_type, status, phase,
  progress_percentage, total_records, processed_records,
  successful_records, failed_records, duplicate_records,
  source_data, filters, error_report, import_summary,
  created_at, updated_at, completed_at
)
SELECT
  j.id,
  '00000000-0000-0000-0000-000000000000'::uuid,          -- legacy rows had no user attribution
  CASE                                                    -- heuristic map into the enhanced type vocabulary
    WHEN j.type IN ('venues-csv','events-csv','tags-csv','personalities-csv',
                    'api-venues','api-events','api-news','api-personalities',
                    'file-upload','web-scraping') THEN j.type
    WHEN j.type ~* 'venue'                          THEN 'api-venues'
    WHEN j.type ~* 'event'                          THEN 'api-events'
    WHEN j.type ~* 'news'                           THEN 'api-news'
    WHEN j.type ~* 'personalit'                     THEN 'api-personalities'
    WHEN j.type ~* 'csv|upload|file'                THEN 'file-upload'
    ELSE 'web-scraping'
  END,
  CASE WHEN j.type ~* 'csv' THEN 'csv' ELSE 'api' END,
  CASE j.status
    WHEN 'queued'    THEN 'pending'
    WHEN 'running'   THEN 'processing'
    WHEN 'paused'    THEN 'pending'
    WHEN 'completed' THEN 'completed'
    WHEN 'failed'    THEN 'failed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END,
  CASE j.status
    WHEN 'queued'  THEN 'queued'
    WHEN 'paused'  THEN 'queued'
    WHEN 'running' THEN 'processing'
    ELSE 'cleanup'
  END,
  LEAST(GREATEST(coalesce(j.progress, 0), 0), 100),
  coalesce(j.total_items, 0),
  coalesce(j.processed_items, 0),
  coalesce(j.successful_items, 0),
  coalesce(j.failed_items, 0),
  coalesce(j.duplicate_items, 0),
  j.data,
  coalesce(j.import_config, '{}'::jsonb),
  CASE WHEN j.error_details IS NOT NULL
       THEN jsonb_build_object('error_details', j.error_details)
       ELSE '{}'::jsonb END,
  jsonb_build_object(
    'legacy', true,
    'legacy_table', 'import_jobs',
    'legacy_type', j.type,
    'legacy_status', j.status,
    'message', j.message,
    'batch_size', j.batch_size,
    'current_batch', j.current_batch,
    'total_batches', j.total_batches,
    'retry_count', j.retry_count,
    'max_retries', j.max_retries
  ),
  j.created_at,
  j.updated_at,
  CASE WHEN j.status IN ('completed','failed','cancelled') THEN j.updated_at END
FROM public.import_jobs j
ON CONFLICT (id) DO NOTHING;

-- ── 2. Drop the legacy table + its dedicated trigger function ───────────────
DROP TABLE public.import_jobs;
DROP FUNCTION IF EXISTS public.update_import_jobs_updated_at();

-- ── 3. Compatibility view (legacy column names / status vocabulary) ─────────
CREATE VIEW public.import_jobs
WITH (security_invoker = true) AS
SELECT
  e.id,
  coalesce(e.import_summary->>'legacy_type', e.type)      AS type,
  CASE e.status
    WHEN 'pending'    THEN 'queued'
    WHEN 'validating' THEN 'running'
    WHEN 'processing' THEN 'running'
    ELSE e.status
  END                                                     AS status,
  coalesce(e.progress_percentage, 0)                      AS progress,
  coalesce((e.import_summary->>'current_batch')::int, 0)  AS current_batch,
  coalesce((e.import_summary->>'total_batches')::int, 1)  AS total_batches,
  coalesce(e.processed_records, 0)                        AS processed_items,
  coalesce(e.total_records, 0)                            AS total_items,
  coalesce(e.import_summary->>'message', '')              AS message,
  e.error_report->>'error_details'                        AS error_details,
  coalesce((e.import_summary->>'retry_count')::int, 0)    AS retry_count,
  coalesce((e.import_summary->>'max_retries')::int, 3)    AS max_retries,
  coalesce(e.source_data, '{}'::jsonb)                    AS data,
  coalesce((e.import_summary->>'batch_size')::int, 50)    AS batch_size,
  e.created_at,
  e.updated_at,
  coalesce(e.successful_records, 0)                       AS successful_items,
  coalesce(e.failed_records, 0)                           AS failed_items,
  coalesce(e.duplicate_records, 0)                        AS duplicate_items,
  e.filters                                               AS import_config
FROM public.import_jobs_enhanced e;

COMMENT ON VIEW public.import_jobs IS
  'Compatibility shim over import_jobs_enhanced (2026-08 job-table merge). Read-only; new code should use import_jobs_enhanced.';

GRANT SELECT ON public.import_jobs TO authenticated, service_role;

-- ── 4. Realtime: cockpit subscription moves to import_jobs_enhanced ─────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public' AND tablename = 'import_jobs_enhanced'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs_enhanced;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'supabase_realtime publication update skipped: %', SQLERRM;
END $$;
