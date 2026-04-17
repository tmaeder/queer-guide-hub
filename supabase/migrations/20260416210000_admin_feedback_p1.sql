-- Admin feedback overhaul — Phase 1 (triage speed)
-- Adds priority, labels, and assignee so admins can sort and distribute work
-- without extra tables. Indexes are partial on content_type='feedback' to
-- keep api_error rows lean.

ALTER TABLE community_submissions
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Guard the priority domain without an enum (keeps future additions easy).
ALTER TABLE community_submissions
  DROP CONSTRAINT IF EXISTS community_submissions_priority_check;
ALTER TABLE community_submissions
  ADD CONSTRAINT community_submissions_priority_check
  CHECK (priority BETWEEN 0 AND 3);

-- Ordering the kanban by (status, priority) is the hot path.
CREATE INDEX IF NOT EXISTS idx_cs_feedback_status_prio
  ON community_submissions (feedback_status, priority)
  WHERE content_type = 'feedback';

-- Assignee lookup (board filter "mine").
CREATE INDEX IF NOT EXISTS idx_cs_feedback_assignee
  ON community_submissions (assignee_id)
  WHERE content_type = 'feedback' AND assignee_id IS NOT NULL;

-- Label filter uses GIN so `labels && array[...]` is an index scan.
CREATE INDEX IF NOT EXISTS idx_cs_feedback_labels
  ON community_submissions USING GIN (labels)
  WHERE content_type = 'feedback';
