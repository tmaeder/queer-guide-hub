-- Phase γ (D3): Admin automation foundation.
-- Tables for moderator-facing rules engine + audit trail.
-- Named admin_automations to avoid collision with the pre-existing
-- public.automation_rules (which is for content quality validation rules).

CREATE TABLE IF NOT EXISTS "public"."admin_automations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text UNIQUE NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "managed_by" text NOT NULL DEFAULT 'user' CHECK (managed_by IN ('user','system')),
  "enabled" boolean NOT NULL DEFAULT true,
  "trigger" jsonb NOT NULL,
  "conditions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "action" jsonb NOT NULL,
  "schedule" text,
  "last_run_at" timestamptz,
  "last_run_status" text,
  "created_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_automations IS
  'Moderator-facing automations. Each row is one WHEN/AND/THEN.';

CREATE INDEX IF NOT EXISTS admin_automations_enabled_idx
  ON public.admin_automations (enabled) WHERE enabled;

CREATE INDEX IF NOT EXISTS admin_automations_managed_idx
  ON public.admin_automations (managed_by);

CREATE TABLE IF NOT EXISTS "public"."admin_automation_runs" (
  "id" bigserial PRIMARY KEY,
  "automation_id" uuid REFERENCES public.admin_automations(id) ON DELETE CASCADE,
  "automation_slug" text NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "status" text NOT NULL CHECK (status IN ('success','partial','error','dry_run')),
  "items_examined" int NOT NULL DEFAULT 0,
  "items_changed" int NOT NULL DEFAULT 0,
  "summary" jsonb,
  "error" text
);

COMMENT ON TABLE public.admin_automation_runs IS
  'Audit log of admin_automations executions (and dry-runs).';

CREATE INDEX IF NOT EXISTS admin_automation_runs_automation_started_idx
  ON public.admin_automation_runs (automation_id, started_at DESC);

CREATE INDEX IF NOT EXISTS admin_automation_runs_started_idx
  ON public.admin_automation_runs (started_at DESC);

ALTER TABLE public.admin_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_automations_select"
  ON public.admin_automations FOR SELECT
  USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));

CREATE POLICY "admin_automations_admin_write"
  ON public.admin_automations FOR ALL
  USING (has_any_role_jwt(ARRAY['admin'::app_role]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));

CREATE POLICY "admin_automation_runs_select"
  ON public.admin_automation_runs FOR SELECT
  USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));

CREATE OR REPLACE FUNCTION public.admin_automations_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_automations_touch_updated_at ON public.admin_automations;
CREATE TRIGGER admin_automations_touch_updated_at
  BEFORE UPDATE ON public.admin_automations
  FOR EACH ROW EXECUTE FUNCTION public.admin_automations_touch_updated_at();
