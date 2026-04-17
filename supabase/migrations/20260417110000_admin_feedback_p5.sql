-- Admin feedback overhaul — Phase 5 (ticketing-style notifications + API kanban)
-- notify_submitter gates automatic status-change / resolution emails. Default
-- true so the loop stays closed by default; admins can mute noisy tickets.

ALTER TABLE community_submissions
  ADD COLUMN IF NOT EXISTS notify_submitter boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN community_submissions.notify_submitter IS
  'If true and data.contact_email is set, admins'' status changes trigger a templated email to the submitter (ticketing-style). Default true.';
