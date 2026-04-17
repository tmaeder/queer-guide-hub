-- Admin feedback overhaul — Phase 2 (signal quality)
-- duplicate_of links a submission to its canonical twin.
-- is_spam is toggled by the detect-feedback-spam rule + manual admin override.
-- feedback_duplicate_suggestions is populated by the detect-feedback-duplicates
-- cron; admins confirm or dismiss each suggestion.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE community_submissions
  ADD COLUMN IF NOT EXISTS duplicate_of uuid
    REFERENCES community_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_spam boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cs_feedback_spam
  ON community_submissions (is_spam)
  WHERE content_type = 'feedback';

CREATE INDEX IF NOT EXISTS idx_cs_feedback_duplicate_of
  ON community_submissions (duplicate_of)
  WHERE content_type = 'feedback' AND duplicate_of IS NOT NULL;

-- Trigram index on the jsonb title for fast similarity lookup.
CREATE INDEX IF NOT EXISTS idx_cs_feedback_title_trgm
  ON community_submissions USING GIN ((data->>'title') gin_trgm_ops)
  WHERE content_type = 'feedback';

CREATE TABLE IF NOT EXISTS feedback_duplicate_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  a_id uuid NOT NULL REFERENCES community_submissions(id) ON DELETE CASCADE,
  b_id uuid NOT NULL REFERENCES community_submissions(id) ON DELETE CASCADE,
  similarity real NOT NULL CHECK (similarity >= 0 AND similarity <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed boolean NOT NULL DEFAULT false,
  dismissed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at timestamptz,
  -- Pairs are stored in canonical order so (a, b) == (b, a).
  CONSTRAINT fds_ordered CHECK (a_id < b_id),
  UNIQUE (a_id, b_id)
);

CREATE INDEX IF NOT EXISTS idx_fds_open
  ON feedback_duplicate_suggestions (a_id, b_id)
  WHERE dismissed = false;

CREATE INDEX IF NOT EXISTS idx_fds_b_open
  ON feedback_duplicate_suggestions (b_id)
  WHERE dismissed = false;

-- RLS: admins read + write, everyone else blocked.
ALTER TABLE feedback_duplicate_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fds_admins_read ON feedback_duplicate_suggestions;
CREATE POLICY fds_admins_read ON feedback_duplicate_suggestions
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS fds_admins_write ON feedback_duplicate_suggestions;
CREATE POLICY fds_admins_write ON feedback_duplicate_suggestions
  FOR UPDATE TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS fds_service_insert ON feedback_duplicate_suggestions;
CREATE POLICY fds_service_insert ON feedback_duplicate_suggestions
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ── Duplicate detection RPC ────────────────────────────────────────
-- Finds title pairs above threshold in the last `days_window` days
-- and upserts them (canonical a_id < b_id). Skips dismissed pairs.
CREATE OR REPLACE FUNCTION detect_feedback_duplicates(
  p_threshold real DEFAULT 0.45,
  p_days_window integer DEFAULT 90
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH pairs AS (
    SELECT
      LEAST(a.id, b.id)   AS a_id,
      GREATEST(a.id, b.id) AS b_id,
      similarity(a.data->>'title', b.data->>'title') AS sim
    FROM community_submissions a
    JOIN community_submissions b
      ON a.id < b.id
      AND b.content_type = 'feedback'
      AND b.duplicate_of IS NULL
      AND b.is_spam = false
      AND b.submitted_at > now() - make_interval(days => p_days_window)
      AND (b.data->>'title') %> (a.data->>'title')
    WHERE a.content_type = 'feedback'
      AND a.duplicate_of IS NULL
      AND a.is_spam = false
      AND a.submitted_at > now() - make_interval(days => p_days_window)
  )
  INSERT INTO feedback_duplicate_suggestions (a_id, b_id, similarity)
  SELECT a_id, b_id, sim FROM pairs WHERE sim >= p_threshold
  ON CONFLICT (a_id, b_id) DO UPDATE
    SET similarity = EXCLUDED.similarity
    WHERE feedback_duplicate_suggestions.dismissed = false;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ── Heuristic spam classifier ──────────────────────────────────────
-- Returns true when content smells like noise. Called by the BEFORE INSERT
-- trigger below; admins can also flip is_spam manually later.
CREATE OR REPLACE FUNCTION is_feedback_spam(p_data jsonb) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_title text := coalesce(p_data->>'title', '');
  v_desc  text := coalesce(p_data->>'description', '');
  v_email text := coalesce(p_data->>'contact_email', '');
  v_body  text := v_title || ' ' || v_desc;
  v_links integer;
  v_len   integer;
  v_letters integer;
BEGIN
  IF v_body = ' ' OR length(btrim(v_body)) = 0 THEN
    RETURN true;
  END IF;

  -- Link flood (most commented-spam signal).
  v_links := (SELECT count(*) FROM regexp_matches(v_body, 'https?://', 'gi'));
  IF v_links >= 3 THEN
    RETURN true;
  END IF;

  -- Burner / temp-mail domains.
  IF v_email ~* '@(mailinator|guerrillamail|10minutemail|yopmail|tempmail|sharklasers|discard\.email)\.' THEN
    RETURN true;
  END IF;

  -- Text with almost no letters is usually copy-pasted links or gibberish.
  v_len := length(v_body);
  v_letters := length(regexp_replace(v_body, '[^A-Za-zÀ-ÖØ-öø-ÿ]', '', 'g'));
  IF v_len > 40 AND v_letters::real / v_len < 0.35 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION tg_flag_feedback_spam() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content_type = 'feedback' AND NEW.is_spam = false THEN
    IF is_feedback_spam(NEW.data) THEN
      NEW.is_spam := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_feedback_spam ON community_submissions;
CREATE TRIGGER trg_flag_feedback_spam
  BEFORE INSERT ON community_submissions
  FOR EACH ROW EXECUTE FUNCTION tg_flag_feedback_spam();

-- Nightly duplicate detector. Scheduled off-the-hour to avoid scraper contention
-- (scraper runs at 03:15 UTC). Replayable via unschedule/schedule.
DO $$
BEGIN
  PERFORM cron.unschedule('detect-feedback-duplicates');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
SELECT cron.schedule(
  'detect-feedback-duplicates',
  '17 3 * * *',
  $cron$SELECT public.detect_feedback_duplicates(0.45, 90)$cron$
);
