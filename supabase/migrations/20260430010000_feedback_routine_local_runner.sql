-- User-confirmed: extend the runner enum to allow 'local' so the local
-- poller daemon (scripts/feedback-runner-local.mjs) can claim work.
-- Updates the two CHECK constraints + the two RPCs that validate p_runner
-- in their bodies. No behaviour change beyond accepting the new value.

ALTER TABLE feedback_routine_runs DROP CONSTRAINT IF EXISTS feedback_routine_runs_runner_check;
ALTER TABLE feedback_routine_runs ADD CONSTRAINT feedback_routine_runs_runner_check
  CHECK (runner IN ('mock','github_actions','webhook','api','local'));

ALTER TABLE feedback_retest_runs DROP CONSTRAINT IF EXISTS feedback_retest_runs_runner_check;
ALTER TABLE feedback_retest_runs ADD CONSTRAINT feedback_retest_runs_runner_check
  CHECK (runner IN ('mock','github_actions','webhook','local'));

CREATE OR REPLACE FUNCTION dispatch_claude_routine(
  p_story_id uuid, p_runner text, p_prompt text, p_prompt_hash text
) RETURNS feedback_routine_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  IF p_runner NOT IN ('mock','github_actions','webhook','api','local') THEN
    RAISE EXCEPTION 'invalid_runner: %', p_runner;
  END IF;
  IF coalesce(trim(p_prompt), '') = '' THEN RAISE EXCEPTION 'prompt_required'; END IF;
  IF coalesce(trim(p_prompt_hash), '') = '' THEN RAISE EXCEPTION 'prompt_hash_required'; END IF;

  SELECT * INTO v_story FROM feedback_stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'story_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_story.archived_at IS NOT NULL THEN RAISE EXCEPTION 'story_archived'; END IF;
  IF v_story.approved_for_claude_at IS NULL THEN RAISE EXCEPTION 'not_approved'; END IF;

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

  IF v_minute_ct > 5 THEN RAISE EXCEPTION 'rate_limit_minute'; END IF;
  IF v_day_ct > 50 THEN RAISE EXCEPTION 'rate_limit_day'; END IF;

  SELECT * INTO v_run FROM feedback_routine_runs
   WHERE story_id = p_story_id AND prompt_hash = p_prompt_hash
     AND status NOT IN ('failed','cancelled')
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_run; END IF;

  INSERT INTO feedback_routine_runs (story_id, status, runner, prompt, prompt_hash, created_by)
  VALUES (p_story_id, 'queued', p_runner, p_prompt, p_prompt_hash, v_actor)
  RETURNING * INTO v_run;

  PERFORM _fb_log_event(p_story_id, 'routine_dispatched',
    jsonb_build_object('runner', p_runner, 'run_id', v_run.id), 'user', v_run.id);
  RETURN v_run;
END;
$$;

CREATE OR REPLACE FUNCTION start_retest(p_run_id uuid, p_kind text, p_runner text DEFAULT 'mock')
RETURNS feedback_retest_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_run feedback_routine_runs%ROWTYPE; v_retest feedback_retest_runs%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_kind NOT IN ('typecheck','lint','unit','e2e','targeted') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF p_runner NOT IN ('mock','github_actions','webhook','local') THEN RAISE EXCEPTION 'invalid_runner'; END IF;
  SELECT * INTO v_run FROM feedback_routine_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status NOT IN ('fix_proposed','in_progress') THEN
    RAISE EXCEPTION 'cannot_retest_in_status: %', v_run.status;
  END IF;
  INSERT INTO feedback_retest_runs (routine_run_id, kind, runner, status, created_by)
  VALUES (p_run_id, p_kind, p_runner, 'queued', auth.uid())
  RETURNING * INTO v_retest;
  PERFORM _fb_log_event(v_run.story_id, 'retest_started',
    jsonb_build_object('kind', p_kind, 'runner', p_runner, 'retest_id', v_retest.id),
    'user', v_run.id, v_retest.id);
  RETURN v_retest;
END;
$$;
