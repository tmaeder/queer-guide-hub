-- Wave 3 — Pipeline definition snapshot for reproducible runs
-- Captures DAG (nodes + edges + default_context + version) at run start so
-- subsequent edits to pipeline_definitions don't mutate historical runs.

BEGIN;

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS pipeline_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_version  integer;

CREATE INDEX IF NOT EXISTS ix_pipeline_runs_pipeline_id_version
  ON pipeline_runs(pipeline_id, pipeline_version);

-- Snapshot helper (callable from pipeline-executor)
CREATE OR REPLACE FUNCTION snapshot_pipeline_definition(p_pipeline_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id',              id,
    'name',            name,
    'display_name',    display_name,
    'version',         version,
    'nodes',           nodes,
    'edges',           edges,
    'default_context', default_context,
    'max_concurrency', max_concurrency,
    'timeout_seconds', timeout_seconds,
    'snapshotted_at',  now()
  )
  FROM pipeline_definitions WHERE id = p_pipeline_id;
$$;

-- Auto-bump version on definition update so old snapshots remain meaningful.
CREATE OR REPLACE FUNCTION pipeline_definitions_bump_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.nodes IS DISTINCT FROM OLD.nodes
     OR NEW.edges IS DISTINCT FROM OLD.edges
     OR NEW.default_context IS DISTINCT FROM OLD.default_context THEN
    NEW.version := coalesce(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pipeline_definitions_bump_version ON pipeline_definitions;
CREATE TRIGGER trg_pipeline_definitions_bump_version
BEFORE UPDATE ON pipeline_definitions
FOR EACH ROW EXECUTE FUNCTION pipeline_definitions_bump_version();

COMMIT;
