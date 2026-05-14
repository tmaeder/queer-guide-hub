-- Feedback → Claude routine RPCs.
-- All SECURITY DEFINER. All assert has_any_role_jwt(['admin','moderator']).
-- Each state transition writes a feedback_story_events row.

-- ── helper: append story event ──────────────────────────────────
CREATE OR REPLACE FUNCTION _fb_log_event(
  p_story_id uuid,
  p_kind text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_actor_kind text DEFAULT 'user',
  p_routine_run_id uuid DEFAULT NULL,
  p_retest_run_id uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO feedback_story_events
    (story_id, kind, payload, actor_id, actor_kind, routine_run_id, retest_run_id)
  VALUES
    (p_story_id, p_kind, COALESCE(p_payload, '{}'::jsonb), auth.uid(),
     COALESCE(p_actor_kind, 'user'), p_routine_run_id, p_retest_run_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION _fb_log_event(uuid, text, jsonb, text, uuid, uuid) FROM PUBLIC;

-- ── approve_story_for_claude ───────────────────────────────────
CREATE OR REPLACE FUNCTION approve_story_for_claude(
  p_story_id uuid,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE feedback_stories
     SET approved_for_claude_at = COALESCE(approved_for_claude_at, now()),
         approved_by            = COALESCE(approved_by, v_actor),
         needs_followup_reason  = NULL
   WHERE id = p_story_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM _fb_log_event(
    p_story_id,
    'approved_for_claude',
    jsonb_build_object('note', p_note)
  );
  RETURN p_story_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_story_for_claude(uuid, text) TO authenticated;

-- ── mark_story_needs_followup ──────────────────────────────────
CREATE OR REPLACE FUNCTION mark_story_needs_followup(
  p_story_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE feedback_stories
     SET needs_followup_reason = p_reason,
         approved_for_claude_at = NULL,
         approved_by = NULL
   WHERE id = p_story_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM _fb_log_event(p_story_id, 'needs_followup', jsonb_build_object('reason', p_reason));
  RETURN p_story_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_story_needs_followup(uuid, text) TO authenticated;

-- ── dispatch_claude_routine ────────────────────────────────────
-- Inserts a queued feedback_routine_runs row. The edge function
-- claude-routine-dispatch picks it up, calls the chosen runner, and flips
-- status to 'dispatched' via record_routine_progress.
--
-- Rate limit: max 5 dispatches/min, max 50/day per admin.
CREATE OR REPLACE FUNCTION dispatch_claude_routine(
  p_story_id uuid,
  p_runner text,
  p_prompt text,
  p_prompt_hash text
) RETURNS feedback_routine_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_story feedback_stories%ROWTYPE;
  v_run feedback_routine_runs%ROWTYPE;
  v_minute timestamptz := date_trunc('minute', now());
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_minute_ct integer;
  v_day_ct integer;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_runner NOT IN ('mock','github_actions','webhook','api') THEN
    RAISE EXCEPTION 'invalid_runner: %', p_runner;
  END IF;
  IF coalesce(trim(p_prompt), '') = '' THEN
    RAISE EXCEPTION 'prompt_required';
  END IF;
  IF coalesce(trim(p_prompt_hash), '') = '' THEN
    RAISE EXCEPTION 'prompt_hash_required';
  END IF;

  SELECT * INTO v_story FROM feedback_stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_story.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'story_archived';
  END IF;
  IF v_story.approved_for_claude_at IS NULL THEN
    RAISE EXCEPTION 'not_approved';
  END IF;

  -- Rate limit
  INSERT INTO feedback_dispatch_counters (actor_id, bucket_minute, bucket_day, minute_count, day_count)
  VALUES (v_actor, v_minute, v_day, 1, 1)
  ON CONFLICT (actor_id, bucket_day) DO UPDATE
    SET minute_count = CASE
          WHEN feedback_dispatch_counters.bucket_minute = EXCLUDED.bucket_minute
            THEN feedback_dispatch_counters.minute_count + 1
          ELSE 1 END,
        bucket_minute = EXCLUDED.bucket_minute,
        day_count = feedback_dispatch_counters.day_count + 1
  RETURNING minute_count, day_count INTO v_minute_ct, v_day_ct;

  IF v_minute_ct > 5 THEN
    RAISE EXCEPTION 'rate_limit_minute';
  END IF;
  IF v_day_ct > 50 THEN
    RAISE EXCEPTION 'rate_limit_day';
  END IF;

  -- Idempotent insert: if a live run with the same (story, prompt_hash) exists,
  -- return it without creating a duplicate.
  SELECT * INTO v_run
    FROM feedback_routine_runs
   WHERE story_id = p_story_id
     AND prompt_hash = p_prompt_hash
     AND status NOT IN ('failed','cancelled')
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN v_run;
  END IF;

  INSERT INTO feedback_routine_runs
    (story_id, status, runner, prompt, prompt_hash, created_by)
  VALUES
    (p_story_id, 'queued', p_runner, p_prompt, p_prompt_hash, v_actor)
  RETURNING * INTO v_run;

  PERFORM _fb_log_event(
    p_story_id,
    'routine_dispatched',
    jsonb_build_object('runner', p_runner, 'run_id', v_run.id),
    'user',
    v_run.id
  );
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION dispatch_claude_routine(uuid, text, text, text) TO authenticated;

-- ── record_routine_progress ────────────────────────────────────
-- Idempotent runner-callable transition. Called by claude-routine-callback.
-- Rejects illegal transitions (e.g. fix_proposed → queued).
CREATE OR REPLACE FUNCTION record_routine_progress(
  p_run_id uuid,
  p_status text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_external_ref text DEFAULT NULL,
  p_actor_kind text DEFAULT 'runner'
) RETURNS feedback_routine_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run feedback_routine_runs%ROWTYPE;
BEGIN
  -- Service role + admin both allowed. No has_any_role_jwt check here:
  -- the calling edge function authenticates itself and we want this to work
  -- without a user JWT for runner callbacks. Authorization is enforced by
  -- (a) edge function HMAC verification and (b) the deny-by-default RLS
  -- on the table for non-admins.
  IF NOT (
    has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_status NOT IN ('queued','dispatched','in_progress','fix_proposed','failed','cancelled') THEN
    RAISE EXCEPTION 'invalid_status: %', p_status;
  END IF;

  SELECT * INTO v_run FROM feedback_routine_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Terminal states are sticky.
  IF v_run.status IN ('failed','cancelled') AND p_status <> v_run.status THEN
    RAISE EXCEPTION 'terminal_state: %', v_run.status;
  END IF;
  IF v_run.status = 'fix_proposed' AND p_status NOT IN ('fix_proposed','failed','cancelled') THEN
    RAISE EXCEPTION 'illegal_transition: % → %', v_run.status, p_status;
  END IF;

  UPDATE feedback_routine_runs
     SET status = p_status,
         external_ref = COALESCE(p_external_ref, external_ref),
         finished_at = CASE
           WHEN p_status IN ('fix_proposed','failed','cancelled') THEN COALESCE(finished_at, now())
           ELSE finished_at
         END,
         error = CASE
           WHEN p_status = 'failed' THEN COALESCE(p_payload->>'error', error)
           ELSE error
         END
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  PERFORM _fb_log_event(
    v_run.story_id,
    CASE p_status
      WHEN 'failed' THEN 'routine_failed'
      WHEN 'cancelled' THEN 'routine_cancelled'
      ELSE 'routine_progress'
    END,
    p_payload || jsonb_build_object('status', p_status, 'external_ref', p_external_ref),
    p_actor_kind,
    v_run.id
  );
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION record_routine_progress(uuid, text, jsonb, text, text) TO authenticated, service_role;

-- ── record_fix_proposed ────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_fix_proposed(
  p_run_id uuid,
  p_pr_url text,
  p_commit_sha text,
  p_files text[],
  p_summary text,
  p_confidence text,
  p_risks text,
  p_actor_kind text DEFAULT 'runner'
) RETURNS feedback_routine_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run feedback_routine_runs%ROWTYPE;
BEGIN
  IF NOT (
    has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_confidence IS NOT NULL AND p_confidence NOT IN ('low','medium','high') THEN
    RAISE EXCEPTION 'invalid_confidence';
  END IF;

  UPDATE feedback_routine_runs
     SET status        = 'fix_proposed',
         pr_url        = COALESCE(p_pr_url, pr_url),
         commit_sha    = COALESCE(p_commit_sha, commit_sha),
         files_changed = COALESCE(p_files, files_changed),
         fix_summary   = COALESCE(p_summary, fix_summary),
         confidence    = COALESCE(p_confidence, confidence),
         risks         = COALESCE(p_risks, risks),
         finished_at   = COALESCE(finished_at, now())
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM _fb_log_event(
    v_run.story_id,
    'fix_proposed',
    jsonb_build_object(
      'pr_url', v_run.pr_url,
      'commit_sha', v_run.commit_sha,
      'files_changed', v_run.files_changed,
      'fix_summary', v_run.fix_summary,
      'confidence', v_run.confidence,
      'risks', v_run.risks
    ),
    p_actor_kind,
    v_run.id
  );
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION record_fix_proposed(uuid, text, text, text[], text, text, text, text)
  TO authenticated, service_role;

-- ── start_retest ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION start_retest(
  p_run_id uuid,
  p_kind text,
  p_runner text DEFAULT 'mock'
) RETURNS feedback_retest_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run feedback_routine_runs%ROWTYPE;
  v_retest feedback_retest_runs%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_kind NOT IN ('typecheck','lint','unit','e2e','targeted') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;
  IF p_runner NOT IN ('mock','github_actions','webhook') THEN
    RAISE EXCEPTION 'invalid_runner';
  END IF;

  SELECT * INTO v_run FROM feedback_routine_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found';
  END IF;
  IF v_run.status NOT IN ('fix_proposed','in_progress') THEN
    RAISE EXCEPTION 'cannot_retest_in_status: %', v_run.status;
  END IF;

  INSERT INTO feedback_retest_runs (routine_run_id, kind, runner, status, created_by)
  VALUES (p_run_id, p_kind, p_runner, 'queued', auth.uid())
  RETURNING * INTO v_retest;

  PERFORM _fb_log_event(
    v_run.story_id,
    'retest_started',
    jsonb_build_object('kind', p_kind, 'runner', p_runner, 'retest_id', v_retest.id),
    'user',
    v_run.id,
    v_retest.id
  );
  RETURN v_retest;
END;
$$;

GRANT EXECUTE ON FUNCTION start_retest(uuid, text, text) TO authenticated;

-- ── record_retest_result ───────────────────────────────────────
CREATE OR REPLACE FUNCTION record_retest_result(
  p_retest_id uuid,
  p_status text,
  p_result jsonb DEFAULT '{}'::jsonb,
  p_external_ref text DEFAULT NULL,
  p_actor_kind text DEFAULT 'runner'
) RETURNS feedback_retest_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retest feedback_retest_runs%ROWTYPE;
  v_run feedback_routine_runs%ROWTYPE;
BEGIN
  IF NOT (
    has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_status NOT IN ('queued','running','passed','failed','error') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE feedback_retest_runs
     SET status = p_status,
         result = COALESCE(p_result, result),
         external_ref = COALESCE(p_external_ref, external_ref),
         finished_at = CASE
           WHEN p_status IN ('passed','failed','error') THEN COALESCE(finished_at, now())
           ELSE finished_at
         END
   WHERE id = p_retest_id
   RETURNING * INTO v_retest;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'retest_not_found';
  END IF;

  SELECT * INTO v_run FROM feedback_routine_runs WHERE id = v_retest.routine_run_id;

  PERFORM _fb_log_event(
    v_run.story_id,
    'retest_finished',
    jsonb_build_object('status', p_status, 'kind', v_retest.kind, 'result', p_result),
    p_actor_kind,
    v_run.id,
    v_retest.id
  );
  RETURN v_retest;
END;
$$;

GRANT EXECUTE ON FUNCTION record_retest_result(uuid, text, jsonb, text, text)
  TO authenticated, service_role;

-- ── verify_story ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_story(
  p_story_id uuid,
  p_outcome text,
  p_note text DEFAULT NULL
) RETURNS feedback_stories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story feedback_stories%ROWTYPE;
  v_kind text;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_outcome NOT IN ('resolved','reopen','needs_followup') THEN
    RAISE EXCEPTION 'invalid_outcome';
  END IF;

  IF p_outcome = 'resolved' THEN
    UPDATE feedback_stories
       SET status = 'resolved', resolved_at = COALESCE(resolved_at, now())
     WHERE id = p_story_id
     RETURNING * INTO v_story;
    v_kind := 'verified';
  ELSIF p_outcome = 'reopen' THEN
    UPDATE feedback_stories
       SET status = 'in_progress',
           resolved_at = NULL,
           archived_at = NULL,
           archived_by = NULL,
           archive_reason = NULL
     WHERE id = p_story_id
     RETURNING * INTO v_story;
    v_kind := 'reopened';
  ELSE
    UPDATE feedback_stories
       SET needs_followup_reason = COALESCE(p_note, needs_followup_reason)
     WHERE id = p_story_id
     RETURNING * INTO v_story;
    v_kind := 'needs_followup';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM _fb_log_event(
    p_story_id,
    v_kind,
    jsonb_build_object('outcome', p_outcome, 'note', p_note)
  );
  RETURN v_story;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_story(uuid, text, text) TO authenticated;

-- ── archive_story / unarchive_story ────────────────────────────
CREATE OR REPLACE FUNCTION archive_story(
  p_story_id uuid,
  p_reason text DEFAULT NULL
) RETURNS feedback_stories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story feedback_stories%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE feedback_stories
     SET archived_at    = now(),
         archived_by    = auth.uid(),
         archive_reason = p_reason,
         status         = 'archived'
   WHERE id = p_story_id
   RETURNING * INTO v_story;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM _fb_log_event(
    p_story_id,
    'archived',
    jsonb_build_object('reason', p_reason)
  );
  RETURN v_story;
END;
$$;

CREATE OR REPLACE FUNCTION unarchive_story(p_story_id uuid)
RETURNS feedback_stories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story feedback_stories%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE feedback_stories
     SET archived_at = NULL,
         archived_by = NULL,
         archive_reason = NULL,
         status = CASE WHEN status = 'archived' THEN 'open' ELSE status END
   WHERE id = p_story_id
   RETURNING * INTO v_story;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM _fb_log_event(p_story_id, 'unarchived', '{}'::jsonb);
  RETURN v_story;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_story(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION unarchive_story(uuid) TO authenticated;

-- ── cancel_routine_run ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_routine_run(p_run_id uuid, p_reason text DEFAULT NULL)
RETURNS feedback_routine_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run feedback_routine_runs%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE feedback_routine_runs
     SET status = 'cancelled',
         finished_at = COALESCE(finished_at, now()),
         error = COALESCE(p_reason, error)
   WHERE id = p_run_id
     AND status IN ('queued','dispatched','in_progress')
   RETURNING * INTO v_run;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_cancellable';
  END IF;

  PERFORM _fb_log_event(
    v_run.story_id,
    'routine_cancelled',
    jsonb_build_object('reason', p_reason),
    'user',
    v_run.id
  );
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_routine_run(uuid, text) TO authenticated;
