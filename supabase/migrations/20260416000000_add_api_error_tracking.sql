-- Add columns for API error tracking on community_submissions
ALTER TABLE community_submissions
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Partial unique index for fingerprint dedup (api_error rows only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_submissions_fingerprint
  ON community_submissions (fingerprint)
  WHERE content_type = 'api_error' AND fingerprint IS NOT NULL;

-- Upsert RPC: insert new api_error or bump occurrence count on existing fingerprint
CREATE OR REPLACE FUNCTION upsert_api_error(
  p_fingerprint text,
  p_data jsonb,
  p_source text DEFAULT 'unknown'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Try to bump existing row with same fingerprint
  UPDATE community_submissions
  SET occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      data = jsonb_set(
        data,
        '{last_occurrence}',
        p_data
      )
  WHERE fingerprint = p_fingerprint
    AND content_type = 'api_error'
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Insert new row
  INSERT INTO community_submissions (
    content_type, data, fingerprint, occurrence_count, last_seen_at, feedback_status
  ) VALUES (
    'api_error', p_data, p_fingerprint, 1, now(), 'new'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
