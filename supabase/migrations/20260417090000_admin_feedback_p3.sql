-- Admin feedback overhaul — Phase 3 (loop closure)
-- resolved_at + resolution close the loop. Replies live in data->'replies' jsonb
-- array (so we don't churn the schema for every message). The audit table
-- records state changes so the drawer can show an activity log.

ALTER TABLE community_submissions
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution text;

ALTER TABLE community_submissions
  DROP CONSTRAINT IF EXISTS community_submissions_resolution_check;
ALTER TABLE community_submissions
  ADD CONSTRAINT community_submissions_resolution_check
  CHECK (resolution IS NULL OR resolution IN ('fixed', 'wontfix', 'duplicate', 'invalid'));

-- Idempotency store for inbound GitHub webhooks.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id text PRIMARY KEY,
  source text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_digest text
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_source_at
  ON webhook_deliveries (source, received_at DESC);

-- Append-only audit log for status / assignee / priority / resolution / labels.
CREATE TABLE IF NOT EXISTS community_submissions_audit (
  id bigserial PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES community_submissions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_audit_submission_at
  ON community_submissions_audit (submission_id, at DESC);

ALTER TABLE community_submissions_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cs_audit_admins_read ON community_submissions_audit;
CREATE POLICY cs_audit_admins_read ON community_submissions_audit
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS cs_audit_service_insert ON community_submissions_audit;
CREATE POLICY cs_audit_service_insert ON community_submissions_audit
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

-- Log tracked field changes. Trigger fires on UPDATE only so we do not audit
-- the initial insert. Only feedback rows (content_type='feedback') to keep the
-- table focused.
CREATE OR REPLACE FUNCTION tg_audit_feedback_changes() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := NEW.reviewed_by;
BEGIN
  IF NEW.content_type <> 'feedback' THEN
    RETURN NEW;
  END IF;

  IF NEW.feedback_status IS DISTINCT FROM OLD.feedback_status THEN
    INSERT INTO community_submissions_audit(submission_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'feedback_status', to_jsonb(OLD.feedback_status), to_jsonb(NEW.feedback_status));
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO community_submissions_audit(submission_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'priority', to_jsonb(OLD.priority), to_jsonb(NEW.priority));
  END IF;
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO community_submissions_audit(submission_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'assignee_id', to_jsonb(OLD.assignee_id), to_jsonb(NEW.assignee_id));
  END IF;
  IF NEW.labels IS DISTINCT FROM OLD.labels THEN
    INSERT INTO community_submissions_audit(submission_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'labels', to_jsonb(OLD.labels), to_jsonb(NEW.labels));
  END IF;
  IF NEW.resolution IS DISTINCT FROM OLD.resolution THEN
    INSERT INTO community_submissions_audit(submission_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'resolution', to_jsonb(OLD.resolution), to_jsonb(NEW.resolution));
  END IF;
  IF NEW.is_spam IS DISTINCT FROM OLD.is_spam THEN
    INSERT INTO community_submissions_audit(submission_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'is_spam', to_jsonb(OLD.is_spam), to_jsonb(NEW.is_spam));
  END IF;
  IF NEW.duplicate_of IS DISTINCT FROM OLD.duplicate_of THEN
    INSERT INTO community_submissions_audit(submission_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'duplicate_of', to_jsonb(OLD.duplicate_of), to_jsonb(NEW.duplicate_of));
  END IF;
  IF NEW.forwarded_at IS DISTINCT FROM OLD.forwarded_at AND NEW.forwarded_at IS NOT NULL THEN
    INSERT INTO community_submissions_audit(submission_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'forwarded', NULL, to_jsonb(NEW.github_issue_number));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_feedback_changes ON community_submissions;
CREATE TRIGGER trg_audit_feedback_changes
  AFTER UPDATE ON community_submissions
  FOR EACH ROW EXECUTE FUNCTION tg_audit_feedback_changes();
