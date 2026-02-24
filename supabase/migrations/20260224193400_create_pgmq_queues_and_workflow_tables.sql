-- ============================================================
-- Phase 0: pgmq Queues + Workflow Orchestration Tables
-- Applied: 2026-02-24
-- ============================================================

-- 1. Create pgmq queues
SELECT pgmq.create('scheduled_jobs');
SELECT pgmq.create('import_jobs');
SELECT pgmq.create('content_processing');
SELECT pgmq.create('dead_letter');

-- 2. workflow_definitions — what can run
CREATE TABLE public.workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  description TEXT,
  edge_function TEXT NOT NULL,
  queue_name TEXT NOT NULL,
  default_payload JSONB DEFAULT '{}',
  schedule TEXT,
  max_retries INT DEFAULT 3,
  retry_backoff_base INT DEFAULT 30,
  max_concurrency INT DEFAULT 1,
  timeout_seconds INT DEFAULT 150,
  is_enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 5,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_definitions_select"
  ON public.workflow_definitions FOR SELECT USING (true);

CREATE POLICY "workflow_definitions_admin_all"
  ON public.workflow_definitions FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 3. workflow_runs — execution history
CREATE TABLE public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES public.workflow_definitions(id) ON DELETE SET NULL,
  workflow_name TEXT NOT NULL,
  queue_name TEXT NOT NULL,
  pgmq_msg_id BIGINT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','dead_letter','cancelled')),
  attempt INT DEFAULT 1,
  max_attempts INT DEFAULT 3,
  input_payload JSONB DEFAULT '{}',
  output_result JSONB,
  error_message TEXT,
  error_details JSONB,
  progress_pct INT DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  items_total INT DEFAULT 0,
  items_processed INT DEFAULT 0,
  items_succeeded INT DEFAULT 0,
  items_failed INT DEFAULT 0,
  queued_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  next_retry_at TIMESTAMPTZ,
  triggered_by TEXT DEFAULT 'cron'
    CHECK (triggered_by IN ('cron','webhook','admin','api','system')),
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workflow_runs_status ON public.workflow_runs(status);
CREATE INDEX idx_workflow_runs_definition ON public.workflow_runs(definition_id);
CREATE INDEX idx_workflow_runs_created ON public.workflow_runs(created_at DESC);
CREATE INDEX idx_workflow_runs_workflow_name ON public.workflow_runs(workflow_name);
CREATE INDEX idx_workflow_runs_idempotency ON public.workflow_runs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_workflow_runs_queued ON public.workflow_runs(queued_at DESC) WHERE status = 'queued';

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_runs_select"
  ON public.workflow_runs FOR SELECT USING (true);

CREATE POLICY "workflow_runs_admin_all"
  ON public.workflow_runs FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_runs;

-- 4. Triggers
CREATE OR REPLACE FUNCTION public.update_workflow_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_workflow_definitions_updated_at
  BEFORE UPDATE ON public.workflow_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_workflow_updated_at();

CREATE TRIGGER set_workflow_runs_updated_at
  BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_workflow_updated_at();

CREATE OR REPLACE FUNCTION public.compute_workflow_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'dead_letter', 'cancelled')
     AND NEW.started_at IS NOT NULL AND NEW.completed_at IS NOT NULL THEN
    NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compute_workflow_run_duration
  BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.compute_workflow_duration();

-- 5. Public wrapper functions for pgmq (edge functions call via supabase.rpc())
CREATE OR REPLACE FUNCTION public.pgmq_send(p_queue TEXT, p_msg JSONB, p_delay INT DEFAULT 0)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
BEGIN
  RETURN pgmq.send(p_queue, p_msg, p_delay);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_send_batch(p_queue TEXT, p_msgs JSONB[], p_delay INT DEFAULT 0)
RETURNS SETOF BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
BEGIN
  RETURN QUERY SELECT * FROM pgmq.send_batch(p_queue, p_msgs, p_delay);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_read(p_queue TEXT, p_vt INT, p_qty INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, enqueued_at TIMESTAMPTZ, vt TIMESTAMPTZ, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
    FROM pgmq.read(p_queue, p_vt, p_qty) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_archive(p_queue TEXT, p_msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
BEGIN
  RETURN pgmq.archive(p_queue, p_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_delete(p_queue TEXT, p_msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
BEGIN
  RETURN pgmq.delete(p_queue, p_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_set_vt(p_queue TEXT, p_msg_id BIGINT, vt_seconds INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, enqueued_at TIMESTAMPTZ, vt TIMESTAMPTZ, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
    FROM pgmq.set_vt(p_queue, p_msg_id, vt_seconds) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_metrics(p_queue TEXT)
RETURNS TABLE(queue_name TEXT, queue_length BIGINT, newest_msg_age_sec INT, oldest_msg_age_sec INT, total_messages BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
BEGIN
  RETURN QUERY SELECT r.queue_name, r.queue_length, r.newest_msg_age_sec, r.oldest_msg_age_sec, r.total_messages
    FROM pgmq.metrics(p_queue) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_metrics_all()
RETURNS TABLE(queue_name TEXT, queue_length BIGINT, newest_msg_age_sec INT, oldest_msg_age_sec INT, total_messages BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
BEGIN
  RETURN QUERY SELECT r.queue_name, r.queue_length, r.newest_msg_age_sec, r.oldest_msg_age_sec, r.total_messages
    FROM pgmq.metrics_all() r;
END;
$$;
