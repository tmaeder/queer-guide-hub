-- Pipeline node templates: saveable reusable DAG fragments (selection of nodes + edges)
CREATE TABLE IF NOT EXISTS pipeline_node_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'custom'
    CHECK (category IN ('custom', 'common', 'source', 'processing', 'commit', 'error-handling')),
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  use_count integer NOT NULL DEFAULT 0,
  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_node_templates_category
  ON pipeline_node_templates (category, name);

ALTER TABLE pipeline_node_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage templates"
  ON pipeline_node_templates FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin'));

CREATE OR REPLACE FUNCTION increment_template_use_count(p_template_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE pipeline_node_templates
  SET use_count = use_count + 1, updated_at = now()
  WHERE id = p_template_id;
$$;
