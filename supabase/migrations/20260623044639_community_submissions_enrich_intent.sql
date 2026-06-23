-- Submitter-driven enrichment: a community submission can either CREATE a new
-- entity (default) or be proposed as an ENRICHMENT of an existing one. The scan
-- flow at /submit sets these when the user picks "Link & enrich [match]".
--
-- These are distinct from the admin-only promoted_to_id / promoted_to_table,
-- which are set during review. source-community-submissions reads them and, for
-- intent='enrich', stamps the staging row's dedup_match_id so the existing
-- commit_*_staging_batch merge path updates the linked entity on approval.

ALTER TABLE public.community_submissions
  ADD COLUMN IF NOT EXISTS submission_intent text NOT NULL DEFAULT 'create',
  ADD COLUMN IF NOT EXISTS proposed_link_id uuid,
  ADD COLUMN IF NOT EXISTS proposed_link_table text;

-- Guard the intent vocabulary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_submissions_submission_intent_check'
  ) THEN
    ALTER TABLE public.community_submissions
      ADD CONSTRAINT community_submissions_submission_intent_check
      CHECK (submission_intent IN ('create', 'enrich'));
  END IF;
END $$;

COMMENT ON COLUMN public.community_submissions.submission_intent IS
  'create = propose a new entity (default); enrich = propose an update to proposed_link_id (routed to admin review, merged on approve).';
COMMENT ON COLUMN public.community_submissions.proposed_link_id IS
  'When submission_intent=enrich: the existing entity id this submission should merge into.';
COMMENT ON COLUMN public.community_submissions.proposed_link_table IS
  'When submission_intent=enrich: the target table of proposed_link_id (e.g. venues, events).';

-- Partial index for the admin enrichment triage view.
CREATE INDEX IF NOT EXISTS idx_community_submissions_enrich
  ON public.community_submissions (proposed_link_id)
  WHERE submission_intent = 'enrich';
