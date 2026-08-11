-- news-quality-backfill: stop the perpetual retry loop, and reap stuck jobs.
--
-- Found via llm_call_log the day it went live: news-quality-backfill was 54.7%
-- of ALL LLM spend (~$1.36/day, ~$41/month) — the single largest consumer — and
-- almost none of it was doing new work.
--
-- Measured on 2026-08-10:
--   quality_backfill_jobs   jobs     distinct articles   jobs/article
--   completed              55,450          37,512            1.5x
--   failed                 29,181           1,159           25.2x
--   running                 7,783           1,838            4.2x
--   pending                    51              51            1.0x
--
--   last 2h: 202 jobs created over 81 distinct articles, 128 failed,
--            every failure with error = 'no_decision'.
--
-- Genuine remaining work at that moment: 60 articles unprocessed out of 38,986,
-- with ~30 new articles arriving per day.
--
-- TWO INDEPENDENT DEFECTS
--
-- 1. NO ATTEMPT CEILING. enqueue selects articles WHERE quality_pipeline_version
--    IS NULL. A 'no_decision' failure never stamps that column, so the article
--    stays eligible forever. Each re-enqueue INSERTs a FRESH job row, so the
--    per-row `attempts` counter never exceeds 1 and no backoff or give-up logic
--    can ever observe the repetition — which is why max(attempts) is 1 across
--    29,181 failures. The cron tops the queue up whenever pending < 60, and the
--    failures guarantee it always is.
--
--    'no_decision' means the model returned no usable verdict for that content.
--    Asking a 26th time does not make it decidable; it just costs another call.
--
-- 2. NO REAPER. The run loop marks a job 'running', calls the LLM, then writes
--    the terminal status. If the function times out or crashes in between, the
--    row stays 'running' forever — the loader only ever picks up 'pending'.
--    7,783 rows are stranded there, and because they are neither pending nor
--    failed they also hide from every "is this pipeline healthy" check.
--
-- Deliberately NOT done here: nothing writes news_articles. Marking an article
-- terminal by stamping quality_pipeline_version/quality_status would put a
-- success-shaped value on a row that never succeeded, and those columns carry
-- constraints this migration cannot verify. Eligibility is decided at enqueue
-- time instead, from the job ledger, which is the honest source for "how many
-- times have we already asked".

-- ---------------------------------------------------------------------------
-- 1. Enqueue candidates — the attempt ceiling.
-- ---------------------------------------------------------------------------
-- Replaces the edge function's PostgREST select. Three exclusions, each of
-- which the old query was missing:
--   * articles already asked p_max_failures times   (the retry loop)
--   * articles with a job already pending/running   (the duplicate churn)
--   * articles already processed                    (unchanged, but explicit)
CREATE OR REPLACE FUNCTION public.news_quality_enqueue_candidates(
  p_limit integer DEFAULT 200,
  p_max_failures integer DEFAULT 3
)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT a.id
  FROM public.news_articles a
  WHERE a.quality_pipeline_version IS NULL
    -- already in flight: do not stack a second job on the same article
    AND NOT EXISTS (
      SELECT 1 FROM public.quality_backfill_jobs j
      WHERE j.article_id = a.id AND j.status IN ('pending', 'running')
    )
    -- asked enough times already
    AND (
      SELECT count(*) FROM public.quality_backfill_jobs j
      WHERE j.article_id = a.id AND j.status = 'failed'
    ) < greatest(coalesce(p_max_failures, 3), 1)
  -- Newest first: heal the most-visible recent articles before the long tail.
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT greatest(least(coalesce(p_limit, 200), 20000), 1);
$function$;

REVOKE ALL ON FUNCTION public.news_quality_enqueue_candidates(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.news_quality_enqueue_candidates(integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Reaper — stuck 'running' jobs.
-- ---------------------------------------------------------------------------
-- A job that has been 'running' longer than any plausible LLM call did not
-- finish; the invocation died. Mark it failed with a DISTINCT error so the
-- stranded-crash population stays countable and never silently merges into the
-- 'no_decision' population — they need different fixes.
--
-- Failed, not re-pending: a crashed job is still an article we have paid to ask
-- about, and re-queueing it here would rebuild the same loop this migration
-- exists to break. It counts toward the attempt ceiling above, which is the
-- correct treatment — three crashes on one article is also a reason to stop.
CREATE OR REPLACE FUNCTION public.reap_stale_quality_backfill_jobs(
  p_stale_minutes integer DEFAULT 30,
  p_batch integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reaped integer := 0;
BEGIN
  WITH stale AS (
    SELECT id FROM public.quality_backfill_jobs
    WHERE status = 'running'
      AND created_at < now() - make_interval(mins => greatest(coalesce(p_stale_minutes, 30), 5))
    ORDER BY created_at
    LIMIT greatest(coalesce(p_batch, 5000), 1)
  ), upd AS (
    UPDATE public.quality_backfill_jobs j
    SET status = 'failed',
        error = 'stale_reaped',
        processed_at = now()
    FROM stale s
    WHERE j.id = s.id
    RETURNING j.id
  )
  SELECT count(*) INTO v_reaped FROM upd;

  RETURN jsonb_build_object('reaped', v_reaped, 'stale_minutes', p_stale_minutes);
END $function$;

REVOKE ALL ON FUNCTION public.reap_stale_quality_backfill_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stale_quality_backfill_jobs(integer, integer) TO service_role;

-- Supporting index: both functions filter jobs by (article_id, status), and the
-- reaper scans (status, created_at). Without these the enqueue candidate query
-- does two seq scans of a 92k-row table per call, every 10 minutes.
CREATE INDEX IF NOT EXISTS idx_qbj_article_status
  ON public.quality_backfill_jobs (article_id, status);
CREATE INDEX IF NOT EXISTS idx_qbj_status_created
  ON public.quality_backfill_jobs (status, created_at);

-- ---------------------------------------------------------------------------
-- 3. Reaper cron. Registry row first — admin_automations is the registry of
--    record and sync_automations_to_cron() reconciles pg_cron against it.
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
VALUES (
  'quality_backfill_reaper',
  'quality_backfill_reaper',
  'Marks news quality-backfill jobs stuck in running (crashed invocations) as failed, so they stop hiding from health checks and count toward the enqueue attempt ceiling.',
  'system',
  true,
  jsonb_build_object('type','schedule'),
  '25 * * * *',
  jsonb_build_object(
    'type','cron',
    'jobname','quality_backfill_reaper',
    'command','SELECT public.reap_stale_quality_backfill_jobs(30, 5000)'
  )
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = true;

SELECT cron.schedule('quality_backfill_reaper', '25 * * * *',
                     'SELECT public.reap_stale_quality_backfill_jobs(30, 5000)')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quality_backfill_reaper');
