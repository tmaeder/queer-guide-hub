-- ============================================================
-- Pipeline Engine: Tables, Queue, RLS, Indexes
-- Applied: 2026-03-30
-- Builds on existing pgmq + workflow orchestration (Phase 0-3)
-- NOTE: This file reflects what was applied via apply_migration.
-- The pgmq_metrics_all function required DROP FUNCTION first.
-- ============================================================

-- 1. pipeline_node_types — Registry of composable node types
CREATE TABLE IF NOT EXISTS public.pipeline_node_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('source','processor','validator','enricher','output','control')),
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  edge_function TEXT,
  config_schema JSONB DEFAULT '{}',
  input_ports JSONB DEFAULT '[]',
  output_ports JSONB DEFAULT '[]',
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pipeline_node_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_node_types_select" ON public.pipeline_node_types
  FOR SELECT USING (true);

CREATE POLICY "pipeline_node_types_admin_all" ON public.pipeline_node_types
  FOR ALL USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 2. pipeline_definitions — DAG storage (nodes + edges as JSONB)
CREATE TABLE IF NOT EXISTS public.pipeline_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  description TEXT,
  nodes JSONB DEFAULT '[]',
  edges JSONB DEFAULT '[]',
  default_context JSONB DEFAULT '{}',
  max_concurrency INT DEFAULT 3,
  timeout_seconds INT DEFAULT 300,
  schedule TEXT,
  is_template BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  version INT DEFAULT 1,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pipeline_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_definitions_select" ON public.pipeline_definitions
  FOR SELECT USING (true);

CREATE POLICY "pipeline_definitions_admin_all" ON public.pipeline_definitions
  FOR ALL USING (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE INDEX idx_pipeline_definitions_name ON public.pipeline_definitions(name);
CREATE INDEX idx_pipeline_definitions_schedule ON public.pipeline_definitions(schedule) WHERE schedule IS NOT NULL;
CREATE INDEX idx_pipeline_definitions_template ON public.pipeline_definitions(is_template) WHERE is_template = true;

-- 3. pipeline_runs — Execution tracking with per-node state (Realtime-enabled)
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID REFERENCES public.pipeline_definitions(id) ON DELETE SET NULL,
  pipeline_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','cancelled','paused')),
  node_states JSONB DEFAULT '{}',
  context JSONB DEFAULT '{}',
  items_total INT DEFAULT 0,
  items_processed INT DEFAULT 0,
  items_succeeded INT DEFAULT 0,
  items_failed INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  triggered_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_runs_select" ON public.pipeline_runs
  FOR SELECT USING (true);

CREATE POLICY "pipeline_runs_admin_all" ON public.pipeline_runs
  FOR ALL USING (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE INDEX idx_pipeline_runs_pipeline_id ON public.pipeline_runs(pipeline_id);
CREATE INDEX idx_pipeline_runs_status ON public.pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_created_at ON public.pipeline_runs(created_at DESC);
CREATE INDEX idx_pipeline_runs_pipeline_name ON public.pipeline_runs(pipeline_name);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.pipeline_runs_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status IN ('completed', 'failed', 'cancelled') AND OLD.status NOT IN ('completed', 'failed', 'cancelled') THEN
    NEW.completed_at = now();
    IF NEW.started_at IS NOT NULL THEN
      NEW.duration_ms = EXTRACT(EPOCH FROM (now() - NEW.started_at))::INT * 1000;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pipeline_runs_updated_at
  BEFORE UPDATE ON public.pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_runs_update_updated_at();

-- Enable Realtime for live UI updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_runs;

-- 4. api_circuit_breakers — Circuit breaker state per external API
CREATE TABLE IF NOT EXISTS public.api_circuit_breakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name TEXT UNIQUE NOT NULL,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed','open','half_open')),
  failure_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  open_until TIMESTAMPTZ,
  threshold INT DEFAULT 5,
  reset_timeout_seconds INT DEFAULT 300,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.api_circuit_breakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "circuit_breakers_select" ON public.api_circuit_breakers
  FOR SELECT USING (true);

CREATE POLICY "circuit_breakers_admin_all" ON public.api_circuit_breakers
  FOR ALL USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- Seed circuit breakers for known external APIs
INSERT INTO public.api_circuit_breakers (api_name, threshold, reset_timeout_seconds)
VALUES
  ('foursquare', 5, 600),
  ('eventbrite', 5, 300),
  ('ticketmaster', 5, 300),
  ('google_places', 5, 300),
  ('tomtom', 5, 300),
  ('newsapi', 5, 300),
  ('newsdata', 5, 300),
  ('gnews', 5, 300),
  ('thenewsapi', 5, 300),
  ('ilga_graphql', 3, 900),
  ('rest_countries', 5, 300),
  ('pexels', 5, 300),
  ('travelpayouts', 5, 300),
  ('refuge_restrooms', 5, 300),
  ('awin', 5, 600),
  ('openai', 3, 120),
  ('cloudflare_ai', 3, 120)
ON CONFLICT (api_name) DO NOTHING;

-- 5. Extend ingestion_staging with pipeline context columns
ALTER TABLE public.ingestion_staging
  ADD COLUMN IF NOT EXISTS pipeline_run_id UUID REFERENCES public.pipeline_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS node_id TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_name TEXT;

CREATE INDEX IF NOT EXISTS idx_ingestion_staging_pipeline_run
  ON public.ingestion_staging(pipeline_run_id) WHERE pipeline_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingestion_staging_entity_type
  ON public.ingestion_staging(entity_type) WHERE entity_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingestion_staging_disposition
  ON public.ingestion_staging(disposition);

-- 6. Create pipeline_steps pgmq queue
SELECT pgmq.create('pipeline_steps');

-- 7. Update ALL pgmq wrapper functions to include enrichment_queue + pipeline_steps

CREATE OR REPLACE FUNCTION public.pgmq_send(p_queue TEXT, p_msg JSONB, p_delay INT DEFAULT 0)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter', 'enrichment_queue', 'pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN pgmq.send(p_queue, p_msg, p_delay);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_send_batch(p_queue TEXT, p_msgs JSONB[], p_delay INT DEFAULT 0)
RETURNS SETOF BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter', 'enrichment_queue', 'pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN QUERY SELECT * FROM pgmq.send_batch(p_queue, p_msgs, p_delay);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_read(p_queue TEXT, p_vt INT, p_qty INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, enqueued_at TIMESTAMPTZ, vt TIMESTAMPTZ, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter', 'enrichment_queue', 'pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
    FROM pgmq.read(p_queue, p_vt, p_qty) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_archive(p_queue TEXT, p_msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter', 'enrichment_queue', 'pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN pgmq.archive(p_queue, p_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_delete(p_queue TEXT, p_msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter', 'enrichment_queue', 'pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN pgmq.delete(p_queue, p_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_set_vt(p_queue TEXT, p_msg_id BIGINT, vt_seconds INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, enqueued_at TIMESTAMPTZ, vt TIMESTAMPTZ, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter', 'enrichment_queue', 'pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
    FROM pgmq.set_vt(p_queue, p_msg_id, vt_seconds) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_metrics(p_queue TEXT)
RETURNS TABLE(queue_name TEXT, queue_length BIGINT, newest_msg_age_sec INT, oldest_msg_age_sec INT, total_messages BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter', 'enrichment_queue', 'pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN QUERY SELECT m.queue_name, m.queue_length, m.newest_msg_age_sec, m.oldest_msg_age_sec, m.total_messages
    FROM pgmq.metrics(p_queue) m;
END;
$$;

-- pgmq_metrics_all doesn't need allowlist (returns all queues)
-- but recreate it with consistent search_path
CREATE OR REPLACE FUNCTION public.pgmq_metrics_all()
RETURNS TABLE(queue_name TEXT, queue_length BIGINT, newest_msg_age_sec INT, oldest_msg_age_sec INT, total_messages BIGINT, scrape_time TIMESTAMPTZ, queue_visible_length BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY SELECT m.queue_name, m.queue_length, m.newest_msg_age_sec, m.oldest_msg_age_sec, m.total_messages, m.scrape_time, m.queue_visible_length
    FROM pgmq.metrics_all() m;
END;
$$;

-- 8. Register pipeline-executor in workflow_definitions
INSERT INTO public.workflow_definitions (
  name, display_name, description, edge_function, queue_name,
  default_payload, max_retries, retry_backoff_base, max_concurrency,
  timeout_seconds, is_enabled, priority, tags
) VALUES (
  'pipeline-executor',
  'Pipeline Executor',
  'DAG execution engine — processes pipeline_steps queue messages to orchestrate multi-node pipelines',
  'pipeline-executor',
  'pipeline_steps',
  '{}',
  3, 30, 5, 300, true, 2,
  ARRAY['system', 'pipeline']
) ON CONFLICT (name) DO NOTHING;
