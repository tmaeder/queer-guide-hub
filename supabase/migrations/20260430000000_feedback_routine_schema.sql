-- Feedback → Claude routine → retest → archive loop
-- Phase 1 of the rollout: additive schema only. No drops, no enum renames.
--
-- Adds three sibling tables plus archive columns on feedback_stories so the
-- routine + retest state machines live alongside the existing kanban without
-- overloading feedback_stories.status.
--
-- Permission gate matches existing feedback policies:
--   has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])
-- All mutations go through SECURITY DEFINER RPCs (see next migration).

-- ── Archive columns + approval flags on feedback_stories ─────────
-- feedback_stories.status already includes 'archived' in its CHECK constraint.
-- We add the supporting timestamp/actor/reason columns and the "approved for
-- Claude routine" flag without touching the status enum.
ALTER TABLE feedback_stories
  ADD COLUMN IF NOT EXISTS approved_for_claude_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS needs_followup_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS idx_feedback_stories_archived_at
  ON feedback_stories (archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_stories_approved
  ON feedback_stories (approved_for_claude_at) WHERE approved_for_claude_at IS NOT NULL;

-- ── feedback_routine_runs ───────────────────────────────────────
-- One row per Claude fix attempt for a story. Status is the routine's own
-- state machine; story.status stays as the human-facing kanban column.
CREATE TABLE IF NOT EXISTS feedback_routine_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES feedback_stories(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','dispatched','in_progress','fix_proposed','failed','cancelled')),
  runner text NOT NULL
    CHECK (runner IN ('mock','github_actions','webhook','api')),
  prompt text NOT NULL,
  prompt_hash text NOT NULL,
  external_ref text,
  pr_url text,
  commit_sha text,
  files_changed text[],
  fix_summary text,
  confidence text CHECK (confidence IS NULL OR confidence IN ('low','medium','high')),
  risks text,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- Prevent duplicate live dispatches with the same prompt for the same story.
-- Failed/cancelled runs do not block re-dispatch.
CREATE UNIQUE INDEX IF NOT EXISTS uq_routine_runs_live_prompt
  ON feedback_routine_runs (story_id, prompt_hash)
  WHERE status NOT IN ('failed','cancelled');

CREATE INDEX IF NOT EXISTS idx_routine_runs_story_recent
  ON feedback_routine_runs (story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routine_runs_status
  ON feedback_routine_runs (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_routine_runs_external_ref
  ON feedback_routine_runs (runner, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION tg_feedback_routine_runs_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_routine_runs_touch ON feedback_routine_runs;
CREATE TRIGGER trg_feedback_routine_runs_touch
  BEFORE UPDATE ON feedback_routine_runs
  FOR EACH ROW EXECUTE FUNCTION tg_feedback_routine_runs_touch();

ALTER TABLE feedback_routine_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS routine_runs_admins_read ON feedback_routine_runs;
CREATE POLICY routine_runs_admins_read ON feedback_routine_runs
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

-- Writes go through SECURITY DEFINER RPCs — deny-by-default for authenticated.
DROP POLICY IF EXISTS routine_runs_service_write ON feedback_routine_runs;
CREATE POLICY routine_runs_service_write ON feedback_routine_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── feedback_retest_runs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_retest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_run_id uuid NOT NULL REFERENCES feedback_routine_runs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','passed','failed','error')),
  kind text NOT NULL
    CHECK (kind IN ('typecheck','lint','unit','e2e','targeted')),
  runner text NOT NULL
    CHECK (runner IN ('mock','github_actions','webhook')),
  external_ref text,
  result jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_retest_runs_routine
  ON feedback_retest_runs (routine_run_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_retest_runs_external_ref
  ON feedback_retest_runs (runner, external_ref)
  WHERE external_ref IS NOT NULL;

ALTER TABLE feedback_retest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retest_runs_admins_read ON feedback_retest_runs;
CREATE POLICY retest_runs_admins_read ON feedback_retest_runs
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS retest_runs_service_write ON feedback_retest_runs;
CREATE POLICY retest_runs_service_write ON feedback_retest_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── feedback_story_events ───────────────────────────────────────
-- Structured per-story timeline. Replaces (and back-fills from) the ad-hoc
-- jsonb arrays on feedback_stories.handoffs and community_submissions.data.handoffs.
CREATE TABLE IF NOT EXISTS feedback_story_events (
  id bigserial PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES feedback_stories(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN (
      'status_changed',
      'approved_for_claude',
      'needs_followup',
      'routine_dispatched',
      'routine_progress',
      'fix_proposed',
      'routine_failed',
      'routine_cancelled',
      'retest_started',
      'retest_finished',
      'verified',
      'reopened',
      'archived',
      'unarchived',
      'note',
      'legacy_handoff'
    )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_kind text NOT NULL DEFAULT 'user'
    CHECK (actor_kind IN ('user','system','runner')),
  routine_run_id uuid REFERENCES feedback_routine_runs(id) ON DELETE CASCADE,
  retest_run_id uuid REFERENCES feedback_retest_runs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_events_story_recent
  ON feedback_story_events (story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_events_run
  ON feedback_story_events (routine_run_id) WHERE routine_run_id IS NOT NULL;

ALTER TABLE feedback_story_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS story_events_admins_read ON feedback_story_events;
CREATE POLICY story_events_admins_read ON feedback_story_events
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS story_events_service_write ON feedback_story_events;
CREATE POLICY story_events_service_write ON feedback_story_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── feedback_dispatch_counters ──────────────────────────────────
-- Per-admin per-day rate limiter. dispatch_claude_routine bumps the counter
-- and rejects when daily/minute caps are hit.
CREATE TABLE IF NOT EXISTS feedback_dispatch_counters (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_minute timestamptz NOT NULL,
  bucket_day date NOT NULL,
  minute_count integer NOT NULL DEFAULT 0,
  day_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (actor_id, bucket_day)
);

ALTER TABLE feedback_dispatch_counters ENABLE ROW LEVEL SECURITY;
-- No client policies — only SECURITY DEFINER RPCs touch this table.
