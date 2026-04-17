-- Per-pipeline RBAC: grant view/edit/run to specific users (beyond admin role)
CREATE TABLE IF NOT EXISTS pipeline_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES pipeline_definitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('view', 'edit', 'run')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pipeline_id, user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_permissions_user ON pipeline_permissions (user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_permissions_pipeline ON pipeline_permissions (pipeline_id);

ALTER TABLE pipeline_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage permissions"
  ON pipeline_permissions FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin'));

CREATE POLICY "Users see own grants"
  ON pipeline_permissions FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION has_pipeline_permission(p_pipeline_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM pipeline_permissions
    WHERE pipeline_id = p_pipeline_id
      AND user_id = auth.uid()
      AND (
        permission = p_permission
        OR (p_permission = 'view' AND permission IN ('edit', 'run'))
        OR (p_permission = 'run' AND permission = 'edit')
      )
  );
$$;
