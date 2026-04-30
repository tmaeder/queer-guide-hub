-- Tests for the feedback routine state machine RPCs.
-- Walks: approve → dispatch → record_routine_progress → record_fix_proposed →
-- start_retest → record_retest_result → verify → archive → unarchive.
--
-- Wraps the whole walk in a transaction with ROLLBACK at the end so it's safe
-- to run against any environment, including prod, without leaving fixture rows.
--
-- Usage:
--   psql "$DATABASE_URL" -v admin_user_id=<uuid of an admin user> \
--        -f supabase/tests/feedback_routine_state_machine.sql
--
-- The admin_user_id must resolve to a row in auth.users with the 'admin' role
-- in user_roles. The script sets request.jwt.claims so has_any_role_jwt /
-- auth.uid() succeed for the admin RPCs.
--
-- Expected: all RAISE EXCEPTION lines silent; final NOTICE 'all-tests-passed'.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_admin uuid := :'admin_user_id';
  v_story uuid;
  v_run public.feedback_routine_runs%ROWTYPE;
  v_retest public.feedback_retest_runs%ROWTYPE;
  v_events_before bigint;
  v_events_after bigint;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'admin_user_id psql variable is required';
  END IF;

  -- Impersonate the admin so has_any_role_jwt + auth.uid() resolve.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'user_role', 'admin')::text,
    true);

  -- Seed a story we own and one feedback member so the prompt builder has
  -- something to chew through (not strictly required for state-machine tests
  -- but mirrors prod shape).
  v_story := public.create_story(
    p_title          => 'TEST STATE MACHINE — should rollback',
    p_submission_ids => ARRAY[]::uuid[],
    p_summary        => 'transient fixture'
  );

  -- ===== T1: approve =====
  PERFORM public.approve_story_for_claude(v_story, 'unit test');
  IF (SELECT approved_for_claude_at FROM public.feedback_stories WHERE id = v_story) IS NULL THEN
    RAISE EXCEPTION 'T1 FAILED: approve did not stamp approved_for_claude_at';
  END IF;
  RAISE NOTICE 'T1 PASSED: approve stamps timestamp';

  -- ===== T2: dispatch creates a queued run =====
  v_run := public.dispatch_claude_routine(
    p_story_id    => v_story,
    p_runner      => 'mock',
    p_prompt      => 'fixture-prompt',
    p_prompt_hash => 'fixture-hash-1'
  );
  IF v_run.status <> 'queued' THEN
    RAISE EXCEPTION 'T2 FAILED: expected status=queued, got %', v_run.status;
  END IF;
  RAISE NOTICE 'T2 PASSED: dispatch returns queued run';

  -- ===== T3: dispatch is idempotent on (story_id, prompt_hash) =====
  DECLARE v_again public.feedback_routine_runs%ROWTYPE; BEGIN
    v_again := public.dispatch_claude_routine(v_story, 'mock', 'fixture-prompt', 'fixture-hash-1');
    IF v_again.id <> v_run.id THEN
      RAISE EXCEPTION 'T3 FAILED: second dispatch created a new run instead of returning %', v_run.id;
    END IF;
  END;
  RAISE NOTICE 'T3 PASSED: dispatch is idempotent';

  -- ===== T4: record_routine_progress flips queued → dispatched =====
  PERFORM public.record_routine_progress(v_run.id, 'dispatched',
    '{"runner":"mock"}'::jsonb, 'mock-ext-1', 'system');
  IF (SELECT status FROM public.feedback_routine_runs WHERE id = v_run.id) <> 'dispatched' THEN
    RAISE EXCEPTION 'T4 FAILED: progress did not flip status to dispatched';
  END IF;
  RAISE NOTICE 'T4 PASSED: progress queued → dispatched';

  -- ===== T5: illegal transition fix_proposed → queued is rejected =====
  PERFORM public.record_fix_proposed(v_run.id, 'https://github.com/x/pr/1', 'abcdef0',
    ARRAY['src/test.ts'], 'mock fix', 'medium', 'no real risk', 'runner');
  BEGIN
    PERFORM public.record_routine_progress(v_run.id, 'queued', '{}'::jsonb, NULL, 'system');
    RAISE EXCEPTION 'T5 FAILED: illegal transition was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'illegal_transition%' THEN
      RAISE EXCEPTION 'T5 FAILED: wrong error: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'T5 PASSED: fix_proposed → queued rejected';

  -- ===== T6: start_retest creates a queued retest =====
  v_retest := public.start_retest(v_run.id, 'unit', 'mock');
  IF v_retest.status <> 'queued' OR v_retest.kind <> 'unit' THEN
    RAISE EXCEPTION 'T6 FAILED: expected queued unit retest, got status=% kind=%',
      v_retest.status, v_retest.kind;
  END IF;
  RAISE NOTICE 'T6 PASSED: retest seeded';

  -- ===== T7: record_retest_result flips to passed and writes an event =====
  v_events_before := (SELECT count(*) FROM public.feedback_story_events WHERE story_id = v_story);
  PERFORM public.record_retest_result(v_retest.id, 'passed',
    '{"passed":1,"failed":0,"log_excerpt":"ok"}'::jsonb, 'mock-retest-ref', 'runner');
  IF (SELECT status FROM public.feedback_retest_runs WHERE id = v_retest.id) <> 'passed' THEN
    RAISE EXCEPTION 'T7 FAILED: retest did not flip to passed';
  END IF;
  v_events_after := (SELECT count(*) FROM public.feedback_story_events WHERE story_id = v_story);
  IF v_events_after <= v_events_before THEN
    RAISE EXCEPTION 'T7 FAILED: retest_finished event not appended (before=% after=%)',
      v_events_before, v_events_after;
  END IF;
  RAISE NOTICE 'T7 PASSED: retest passes + event logged';

  -- ===== T8: verify_story marks resolved =====
  PERFORM public.verify_story(v_story, 'resolved', 'all clear');
  IF (SELECT status FROM public.feedback_stories WHERE id = v_story) <> 'resolved' THEN
    RAISE EXCEPTION 'T8 FAILED: verify did not set status=resolved';
  END IF;
  RAISE NOTICE 'T8 PASSED: verify resolved';

  -- ===== T9: archive_story stamps archived_at + status=archived =====
  PERFORM public.archive_story(v_story, 'unit test cleanup');
  PERFORM 1 FROM public.feedback_stories
    WHERE id = v_story AND archived_at IS NOT NULL AND status = 'archived';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'T9 FAILED: archive did not stamp archived_at + status';
  END IF;
  RAISE NOTICE 'T9 PASSED: archive stamps row';

  -- ===== T10: unarchive_story clears archived_at and resets status =====
  PERFORM public.unarchive_story(v_story);
  PERFORM 1 FROM public.feedback_stories
    WHERE id = v_story AND archived_at IS NULL AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'T10 FAILED: unarchive did not clear archive metadata';
  END IF;
  RAISE NOTICE 'T10 PASSED: unarchive clears';

  RAISE NOTICE 'all-tests-passed';
END $$;

ROLLBACK;
