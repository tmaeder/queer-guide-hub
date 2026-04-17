-- Pipeline version history: immutable snapshots of each pipeline_definitions save
CREATE TABLE IF NOT EXISTS pipeline_definition_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES pipeline_definitions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  name text NOT NULL,
  display_name text,
  description text,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  schedule text,
  default_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  saved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pipeline_id, version)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_version_history_pipeline
  ON pipeline_definition_versions (pipeline_id, saved_at DESC);

ALTER TABLE pipeline_definition_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read versions"
  ON pipeline_definition_versions FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin'));

CREATE POLICY "Admins write versions"
  ON pipeline_definition_versions FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin'));

-- Trigger: snapshot pipeline_definitions on each version bump
CREATE OR REPLACE FUNCTION snapshot_pipeline_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.version = OLD.version THEN
    RETURN NEW;
  END IF;

  INSERT INTO pipeline_definition_versions (
    pipeline_id, version, name, display_name, description,
    nodes, edges, schedule, default_context, saved_by
  ) VALUES (
    NEW.id, NEW.version, NEW.name, NEW.display_name, NEW.description,
    NEW.nodes, NEW.edges, NEW.schedule, COALESCE(NEW.default_context, '{}'::jsonb),
    auth.uid()
  )
  ON CONFLICT (pipeline_id, version) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pipeline_version_snapshot ON pipeline_definitions;
CREATE TRIGGER pipeline_version_snapshot
  AFTER INSERT OR UPDATE ON pipeline_definitions
  FOR EACH ROW EXECUTE FUNCTION snapshot_pipeline_version();

-- Backfill v=current for existing pipelines
INSERT INTO pipeline_definition_versions (
  pipeline_id, version, name, display_name, description, nodes, edges, schedule, default_context
)
SELECT id, version, name, display_name, description, nodes, edges, schedule, COALESCE(default_context, '{}'::jsonb)
FROM pipeline_definitions
ON CONFLICT (pipeline_id, version) DO NOTHING;
