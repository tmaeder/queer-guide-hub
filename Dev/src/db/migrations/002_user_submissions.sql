-- 002_user_submissions.sql
-- Extend ingestion_staging to support user-submitted content from the
-- queer.guide Chrome extension. Submissions flow through the same
-- normalize → dedupe → quality-score → review-gate → commit pipeline as
-- scraper-collected items; only the source attribution differs.
--
-- Apply via: supabase db push  (or Supabase MCP / SQL editor)
-- Memory: Dev/web/supabase is gitignored — migrations live here and are
-- applied with the Supabase CLI/MCP, not git.

-- 1. Optional submitter & source-URL columns. Nullable so scraper rows are
--    unaffected. submission_url is separate from raw_data->>'url' because
--    the scraper sets the latter from the canonical source listing whereas
--    extension users submit the page URL they were on.
ALTER TABLE public.ingestion_staging
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submission_url text,
  ADD COLUMN IF NOT EXISTS submission_notes text,
  ADD COLUMN IF NOT EXISTS submission_client text;  -- e.g. "extension/0.1.0"

-- 2. Index for the admin moderation view filtering user submissions by status.
CREATE INDEX IF NOT EXISTS ingestion_staging_user_submissions_idx
  ON public.ingestion_staging (source_type, disposition, created_at DESC)
  WHERE source_type = 'user_submission';

-- 3. Index for "my submissions" status lookups in the extension.
CREATE INDEX IF NOT EXISTS ingestion_staging_submitter_idx
  ON public.ingestion_staging (submitted_by_user_id, created_at DESC)
  WHERE submitted_by_user_id IS NOT NULL;

-- 4. RLS — service role bypasses RLS so worker-submit (using service key)
--    can insert. End users read their own submissions through the worker,
--    which scopes the query by user_id; we still enable RLS for defence in
--    depth in case anon-key access ever leaks.
ALTER TABLE public.ingestion_staging ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read only their own submissions.
DROP POLICY IF EXISTS "users read own submissions" ON public.ingestion_staging;
CREATE POLICY "users read own submissions"
  ON public.ingestion_staging
  FOR SELECT
  TO authenticated
  USING (submitted_by_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for the authenticated role: writes go
-- through worker-submit (service-role) which validates and rate-limits.

COMMENT ON COLUMN public.ingestion_staging.submitted_by_user_id IS
  'auth.users id of the human who submitted this row via the extension. Null for scraper rows.';
COMMENT ON COLUMN public.ingestion_staging.submission_url IS
  'Page URL the user was on when they triggered the extension. Used for audit + admin preview.';
COMMENT ON COLUMN public.ingestion_staging.submission_notes IS
  'Optional free-text note from the user.';
COMMENT ON COLUMN public.ingestion_staging.submission_client IS
  'Submitting client identifier, e.g. extension/0.1.0.';
