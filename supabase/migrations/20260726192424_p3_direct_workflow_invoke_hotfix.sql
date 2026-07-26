-- ============================================================================
-- Content-processing simplification P3 — one orchestrator
-- ----------------------------------------------------------------------------
-- The workflow layer ran every single-function job through pgmq + the
-- workflow-dispatcher edge fn (cron → pgmq scheduled_jobs/import_jobs →
-- dispatcher every minute → HTTP invoke) — a second orchestration engine
-- beside the pipeline-executor DAG. This migration removes the queue hop:
--
--   enqueue_workflow(name, payload, triggered_by)   -- SAME signature
--     → looks up workflow_definitions (kept as a passive ROUTING table)
--     → max_concurrency guard against running workflow_runs
--     → inserts the workflow_runs audit row itself (status 'running')
--     → net.http_post DIRECTLY to the edge function (X-Internal-Secret)
--     → returns the pg_net request id (bigint, as before)
--
-- Run completion is reconciled by reap_stuck_workflow_runs (*/5 cron, kept):
-- it now first matches net._http_response rows to workflow_runs.invoke_request_id
-- (2xx → completed, else failed), then applies the original stuck-run timeout.
--
-- After this + the slimmed dispatcher deploy (pipeline_steps pump only), the
-- scheduled_jobs / import_jobs / content_processing queues are dead; a
-- follow-up migration drops them once confirmed drained.
-- ============================================================================

ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS invoke_request_id bigint;
CREATE INDEX IF NOT EXISTS idx_workflow_runs_invoke_reconcile
  ON public.workflow_runs (invoke_request_id)
  WHERE invoke_request_id IS NOT NULL AND status = 'running';

CREATE OR REPLACE FUNCTION public.enqueue_workflow(
  p_workflow_name text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_triggered_by text DEFAULT 'cron'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_def record;
  v_running int;
  v_secret text;
  v_run_id uuid;
  v_request_id bigint;
  v_triggered text;
BEGIN
  SELECT id, name, edge_function, default_payload, max_concurrency, timeout_seconds
  INTO v_def
  FROM workflow_definitions
  WHERE name = p_workflow_name AND is_enabled = true;

  IF v_def.id IS NULL THEN
    RAISE EXCEPTION 'Workflow "%" not found or disabled', p_workflow_name;
  END IF;

  -- Concurrency guard (replaces the dispatcher's max_concurrency skip):
  -- count non-expired running invocations of this workflow.
  SELECT count(*) INTO v_running
  FROM workflow_runs
  WHERE workflow_name = p_workflow_name
    AND status = 'running'
    AND started_at > now() - make_interval(secs => COALESCE(v_def.timeout_seconds, 600) * 2);
  IF v_running >= COALESCE(v_def.max_concurrency, 1) THEN
    RETURN -1;  -- skipped; next scheduled tick retries
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret';
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'internal_invoke_secret missing from vault';
  END IF;

  -- Clamp triggered_by to the workflow_runs CHECK constraint set.
  v_triggered := CASE WHEN p_triggered_by IN ('cron','webhook','admin','api','system','db_trigger')
                      THEN p_triggered_by ELSE 'system' END;

  INSERT INTO workflow_runs
    (definition_id, workflow_name, queue_name, status, attempt, max_attempts,
     input_payload, queued_at, started_at, triggered_by, idempotency_key)
  VALUES
    (v_def.id, p_workflow_name, 'direct', 'running', 1, 1,
     COALESCE(v_def.default_payload, '{}'::jsonb) || p_payload, now(), now(), v_triggered,
     p_workflow_name || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS'))
  RETURNING id INTO v_run_id;

  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/' || v_def.edge_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- anon bearer passes the gateway for verify_jwt=true targets; fn-level
      -- auth is the X-Internal-Secret (requireAdmin/requireInternalOrAdmin).
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'X-Internal-Secret', v_secret
    ),
    body := COALESCE(v_def.default_payload, '{}'::jsonb) || p_payload
            || jsonb_build_object('workflow', p_workflow_name,
                                  'triggered_by', v_triggered,
                                  'workflow_run_id', v_run_id),
    timeout_milliseconds := LEAST(COALESCE(v_def.timeout_seconds, 300), 300) * 1000
  ) INTO v_request_id;

  UPDATE workflow_runs SET invoke_request_id = v_request_id, updated_at = now()
  WHERE id = v_run_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_workflow(text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_workflow(text, jsonb, text) TO service_role;

-- Admin-facing wrapper (OverviewTab "Run now" — replaces the direct
-- workflow-dispatcher fn invoke).
CREATE OR REPLACE FUNCTION public.admin_enqueue_workflow(
  p_workflow_name text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN public.enqueue_workflow(p_workflow_name, p_payload, 'admin');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_enqueue_workflow(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_enqueue_workflow(text, jsonb) TO authenticated;

-- Reconcile + reap. Reconciliation first (net._http_response rows live ~6h,
-- the cron runs every 5 min), then the original stuck-run logic.
CREATE OR REPLACE FUNCTION public.reap_stuck_workflow_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_count INT;
  v_reconciled INT;
BEGIN
  -- 0. Reconcile direct invocations against pg_net responses.
  WITH matched AS (
    UPDATE public.workflow_runs r
    SET status = CASE WHEN resp.status_code BETWEEN 200 AND 299 THEN 'completed' ELSE 'failed' END,
        error_message = CASE WHEN resp.status_code BETWEEN 200 AND 299 THEN r.error_message
                             ELSE format('direct invoke HTTP %s', COALESCE(resp.status_code::text, resp.error_msg, 'error')) END,
        output_result = CASE WHEN resp.status_code BETWEEN 200 AND 299
                             THEN CASE WHEN left(ltrim(COALESCE(resp.content,'')), 1) IN ('{','[')
                                       THEN resp.content::jsonb ELSE NULL END
                             ELSE r.output_result END,
        completed_at = now(),
        duration_ms = (EXTRACT(EPOCH FROM (now() - r.started_at)) * 1000)::int,
        updated_at = now()
    FROM net._http_response resp
    WHERE r.status = 'running'
      AND r.queue_name = 'direct'
      AND r.invoke_request_id = resp.id
      AND (resp.status_code IS NOT NULL OR resp.error_msg IS NOT NULL)
    RETURNING 1
  )
  SELECT count(*) INTO v_reconciled FROM matched;

  -- 1. Stuck runs past 2× timeout.
  WITH reaped AS (
    UPDATE public.workflow_runs r
    SET status = 'failed',
        error_message = COALESCE(
          r.error_message,
          format('reaped: workflow_run running > %s s without completion',
                 COALESCE(d.timeout_seconds, 600))
        ),
        completed_at = now()
    FROM public.workflow_definitions d
    WHERE r.definition_id = d.id
      AND r.status = 'running'
      AND r.started_at IS NOT NULL
      AND r.started_at < now()
          - make_interval(secs => COALESCE(d.timeout_seconds, 600) * 2)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM reaped;

  -- 2. Orphan runs (no matching definition): fall back to 30 min.
  WITH reaped AS (
    UPDATE public.workflow_runs
    SET status = 'failed',
        error_message = COALESCE(error_message, 'reaped: orphan workflow_run running > 30min'),
        completed_at = now()
    WHERE status = 'running'
      AND definition_id IS NULL
      AND started_at IS NOT NULL
      AND started_at < now() - INTERVAL '30 minutes'
    RETURNING 1
  )
  SELECT v_count + count(*) INTO v_count FROM reaped;

  RETURN v_reconciled + v_count;
END;
$$;
