-- Pipeline error tracking table + materialized summary view
-- Required by: ErrorsTab.tsx, logPipelineError (_shared/pipeline-error-log.ts)

CREATE TABLE IF NOT EXISTS pipeline_errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  function_name text NOT NULL,
  severity text NOT NULL DEFAULT 'error'
    CHECK (severity IN ('info', 'warn', 'error', 'fatal')),
  message text NOT NULL,
  context jsonb,
  pipeline_run_id uuid REFERENCES pipeline_runs(id) ON DELETE SET NULL,
  staging_id uuid,
  stack text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_errors_created ON pipeline_errors (created_at DESC);
CREATE INDEX idx_pipeline_errors_severity ON pipeline_errors (severity, created_at DESC);
CREATE INDEX idx_pipeline_errors_function ON pipeline_errors (function_name, created_at DESC);

-- Time-bucketed summary view used by ErrorsTab summary cards
CREATE OR REPLACE VIEW pipeline_error_summary AS
SELECT
  function_name,
  severity,
  count(*) FILTER (WHERE created_at > now() - interval '1 hour')  AS last_1h,
  count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h,
  count(*) FILTER (WHERE created_at > now() - interval '7 days')   AS last_7d,
  max(created_at) AS last_seen_at
FROM pipeline_errors
GROUP BY function_name, severity;

-- Auto-prune errors older than 30 days (keep table bounded)
SELECT cron.schedule(
  'prune-pipeline-errors',
  '15 3 * * *',
  $$DELETE FROM pipeline_errors WHERE created_at < now() - interval '30 days'$$
);

-- RLS: admin-only read, service role insert
ALTER TABLE pipeline_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert pipeline errors"
  ON pipeline_errors FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can read pipeline errors"
  ON pipeline_errors FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  );
