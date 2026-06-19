-- Autonomous feedback bug loop.
--
-- Closes every manual junction in the feedback → Claude → retest → merge → close
-- pipeline so a confirmed bug flows end-to-end untouched:
--   feedback-auto-dispatch (cron) selects bug-only stories → auto_dispatch_story
--   → local daemon fixes + opens PR → auto_enqueue_retests → daemon runs tests
--   → routine_runs_ready_to_merge → daemon merges PR → record_merge → story resolved.
--
-- Two kill switches live in admin_automations (feedback_auto_dispatch / feedback_auto_merge),
-- both default ENABLED (user chose fully-autonomous, all-green merge). Flip either off to
-- pause instantly. Daily caps bound blast radius.
--
-- Additive + idempotent. No drops of data.

-- ── 1. routine-run columns + status enum ────────────────────────
ALTER TABLE public.feedback_routine_runs
  ADD COLUMN IF NOT EXISTS auto_dispatched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS merge_sha text;

ALTER TABLE public.feedback_routine_runs DROP CONSTRAINT IF EXISTS feedback_routine_runs_status_check;
ALTER TABLE public.feedback_routine_runs ADD CONSTRAINT feedback_routine_runs_status_check
  CHECK (status IN ('queued','dispatched','in_progress','fix_proposed','merged','failed','cancelled'));

CREATE INDEX IF NOT EXISTS idx_routine_runs_auto_dispatched
  ON public.feedback_routine_runs (created_at) WHERE auto_dispatched;
CREATE INDEX IF NOT EXISTS idx_routine_runs_merged
  ON public.feedback_routine_runs (merged_at) WHERE merged_at IS NOT NULL;

-- ── 2. event-kind enum: merged + auto_resolved ──────────────────
ALTER TABLE public.feedback_story_events DROP CONSTRAINT IF EXISTS feedback_story_events_kind_check;
ALTER TABLE public.feedback_story_events ADD CONSTRAINT feedback_story_events_kind_check
  CHECK (kind IN (
    'status_changed','approved_for_claude','needs_followup','routine_dispatched',
    'routine_progress','fix_proposed','routine_failed','routine_cancelled',
    'retest_started','retest_finished','verified','reopened','archived','unarchived',
    'note','legacy_handoff','merged','auto_resolved'
  ));

-- ── 3. automation kill-switch / cap helpers ─────────────────────
CREATE OR REPLACE FUNCTION public._fb_auto_enabled(p_slug text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT enabled FROM public.admin_automations WHERE slug = p_slug), false);
$$;

CREATE OR REPLACE FUNCTION public._fb_auto_cap(p_slug text, p_default int)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (action->>'daily_cap')::int FROM public.admin_automations WHERE slug = p_slug),
    p_default
  );
$$;

REVOKE ALL ON FUNCTION public._fb_auto_enabled(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._fb_auto_cap(text, int) FROM PUBLIC;

-- ── 4. select_auto_dispatch_stories ─────────────────────────────
-- Bug-only, settled, un-dispatched stories eligible for autonomous fixing,
-- capped by the remaining daily auto-dispatch budget.
CREATE OR REPLACE FUNCTION public.select_auto_dispatch_stories(p_limit int DEFAULT 5)
RETURNS TABLE(story_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cap int;
  v_used int;
  v_remaining int;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public._fb_auto_enabled('feedback_auto_dispatch') THEN
    RETURN;
  END IF;

  v_cap := public._fb_auto_cap('feedback_auto_dispatch', 20);
  SELECT count(*) INTO v_used
    FROM public.feedback_routine_runs
   WHERE auto_dispatched
     AND created_at >= date_trunc('day', now());
  v_remaining := v_cap - v_used;
  IF v_remaining <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id
    FROM public.feedback_stories s
   WHERE s.status = 'open'
     AND s.archived_at IS NULL
     AND s.approved_for_claude_at IS NULL
     AND s.needs_followup_reason IS NULL
     AND s.priority <= 2
     AND s.created_at < now() - interval '30 minutes'
     AND EXISTS (SELECT 1 FROM public.feedback_story_members m WHERE m.story_id = s.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.feedback_routine_runs r
        WHERE r.story_id = s.id
          AND r.status IN ('queued','dispatched','in_progress','fix_proposed','merged')
     )
     -- every member must be a confirmed, non-spam, non-duplicate bug
     AND NOT EXISTS (
       SELECT 1
         FROM public.feedback_story_members m
         JOIN public.community_submissions cs ON cs.id = m.submission_id
        WHERE m.story_id = s.id
          AND ( COALESCE(cs.is_spam, false)
                OR cs.duplicate_of IS NOT NULL
                OR COALESCE(cs.autotriage->>'is_probably_spam','false') = 'true'
                OR COALESCE(cs.autotriage->>'category','') <> 'bug' )
     )
   ORDER BY s.priority ASC, s.created_at ASC
   LIMIT LEAST(p_limit, v_remaining);
END;
$$;

GRANT EXECUTE ON FUNCTION public.select_auto_dispatch_stories(int) TO authenticated, service_role;

-- ── 5. auto_dispatch_story ──────────────────────────────────────
-- Service-role/internal autonomous dispatch. Unlike dispatch_claude_routine it
-- needs no admin JWT and is not charged to a per-admin rate-limit bucket; the
-- daily cap + kill switch govern it instead. Approves (system) and queues a
-- runner='local', auto_dispatched=true run, idempotent on (story, prompt_hash).
CREATE OR REPLACE FUNCTION public.auto_dispatch_story(
  p_story_id uuid,
  p_prompt text,
  p_prompt_hash text
) RETURNS public.feedback_routine_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_story public.feedback_stories%ROWTYPE;
  v_run public.feedback_routine_runs%ROWTYPE;
  v_cap int;
  v_used int;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public._fb_auto_enabled('feedback_auto_dispatch') THEN
    RAISE EXCEPTION 'auto_dispatch_disabled';
  END IF;
  IF COALESCE(trim(p_prompt), '') = '' THEN RAISE EXCEPTION 'prompt_required'; END IF;
  IF COALESCE(trim(p_prompt_hash), '') = '' THEN RAISE EXCEPTION 'prompt_hash_required'; END IF;

  v_cap := public._fb_auto_cap('feedback_auto_dispatch', 20);
  SELECT count(*) INTO v_used
    FROM public.feedback_routine_runs
   WHERE auto_dispatched AND created_at >= date_trunc('day', now());
  IF v_used >= v_cap THEN RAISE EXCEPTION 'auto_dispatch_cap_reached'; END IF;

  SELECT * INTO v_story FROM public.feedback_stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'story_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_story.archived_at IS NOT NULL THEN RAISE EXCEPTION 'story_archived'; END IF;

  -- Idempotent: surface an existing live run for the same prompt.
  SELECT * INTO v_run FROM public.feedback_routine_runs
   WHERE story_id = p_story_id AND prompt_hash = p_prompt_hash
     AND status NOT IN ('failed','cancelled')
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_run; END IF;

  UPDATE public.feedback_stories
     SET approved_for_claude_at = COALESCE(approved_for_claude_at, now()),
         needs_followup_reason = NULL
   WHERE id = p_story_id;

  INSERT INTO public.feedback_routine_runs
    (story_id, status, runner, prompt, prompt_hash, created_by, auto_dispatched)
  VALUES
    (p_story_id, 'queued', 'local', p_prompt, p_prompt_hash, NULL, true)
  RETURNING * INTO v_run;

  PERFORM _fb_log_event(p_story_id, 'approved_for_claude',
    jsonb_build_object('auto', true), 'system');
  PERFORM _fb_log_event(p_story_id, 'routine_dispatched',
    jsonb_build_object('runner','local','run_id',v_run.id,'auto',true), 'system', v_run.id);

  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_dispatch_story(uuid, text, text) TO authenticated, service_role;

-- ── 6. auto_enqueue_retests ─────────────────────────────────────
-- Runner-callable. After a fix is proposed, queue the retest matrix without an
-- admin JWT (start_retest requires one). typecheck+lint+unit always; targeted when
-- TS/TSX changed; e2e only when e2e/ specs changed. Idempotent per (run, kind).
CREATE OR REPLACE FUNCTION public.auto_enqueue_retests(p_run_id uuid)
RETURNS SETOF public.feedback_retest_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.feedback_routine_runs%ROWTYPE;
  v_kinds text[];
  v_kind text;
  v_files text[];
  v_retest public.feedback_retest_runs%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_run FROM public.feedback_routine_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_run.status <> 'fix_proposed' THEN
    RAISE EXCEPTION 'cannot_enqueue_retests_in_status: %', v_run.status;
  END IF;

  v_files := COALESCE(v_run.files_changed, ARRAY[]::text[]);
  v_kinds := ARRAY['typecheck','lint','unit'];
  IF EXISTS (SELECT 1 FROM unnest(v_files) f WHERE f ~ '\.(ts|tsx)$') THEN
    v_kinds := v_kinds || 'targeted';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_files) f WHERE f LIKE 'e2e/%') THEN
    v_kinds := v_kinds || 'e2e';
  END IF;

  FOREACH v_kind IN ARRAY v_kinds LOOP
    -- Skip kinds already queued/run for this routine run (idempotent).
    IF EXISTS (SELECT 1 FROM public.feedback_retest_runs
                WHERE routine_run_id = p_run_id AND kind = v_kind) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.feedback_retest_runs (routine_run_id, kind, runner, status, created_by)
    VALUES (p_run_id, v_kind, 'local', 'queued', NULL)
    RETURNING * INTO v_retest;
    PERFORM _fb_log_event(v_run.story_id, 'retest_started',
      jsonb_build_object('kind', v_kind, 'runner','local','retest_id',v_retest.id,'auto',true),
      'runner', v_run.id, v_retest.id);
    RETURN NEXT v_retest;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_enqueue_retests(uuid) TO authenticated, service_role;

-- ── 7. routine_runs_ready_to_merge ──────────────────────────────
-- Autonomous fix_proposed runs whose retests are all green (core kinds present +
-- passed, no non-passed retest), under the merge kill switch + daily cap.
CREATE OR REPLACE FUNCTION public.routine_runs_ready_to_merge(p_limit int DEFAULT 3)
RETURNS TABLE(run_id uuid, pr_url text, story_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cap int;
  v_used int;
  v_remaining int;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public._fb_auto_enabled('feedback_auto_merge') THEN
    RETURN;
  END IF;

  v_cap := public._fb_auto_cap('feedback_auto_merge', 20);
  SELECT count(*) INTO v_used
    FROM public.feedback_routine_runs
   WHERE merged_at IS NOT NULL AND merged_at >= date_trunc('day', now());
  v_remaining := v_cap - v_used;
  IF v_remaining <= 0 THEN RETURN; END IF;

  RETURN QUERY
  SELECT r.id, r.pr_url, r.story_id
    FROM public.feedback_routine_runs r
   WHERE r.status = 'fix_proposed'
     AND r.auto_dispatched
     AND r.pr_url IS NOT NULL
     -- all 3 core kinds present and passed
     AND (SELECT count(DISTINCT kind) FROM public.feedback_retest_runs t
           WHERE t.routine_run_id = r.id AND t.kind IN ('typecheck','lint','unit')
             AND t.status = 'passed') = 3
     -- no retest in a non-passed terminal/pending state
     AND NOT EXISTS (SELECT 1 FROM public.feedback_retest_runs t
                      WHERE t.routine_run_id = r.id AND t.status <> 'passed')
   ORDER BY r.finished_at ASC
   LIMIT LEAST(p_limit, v_remaining);
END;
$$;

GRANT EXECUTE ON FUNCTION public.routine_runs_ready_to_merge(int) TO authenticated, service_role;

-- ── 8. record_merge ─────────────────────────────────────────────
-- Runner-callable terminal transition: marks the run merged, resolves the story,
-- closes member submissions (parity with resolve_story close_items=true), and
-- logs merged + auto_resolved events. Re-verifies green + cap server-side.
CREATE OR REPLACE FUNCTION public.record_merge(
  p_run_id uuid,
  p_merge_sha text DEFAULT NULL
) RETURNS public.feedback_routine_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.feedback_routine_runs%ROWTYPE;
  v_core_passed int;
  v_not_passed int;
  v_cap int;
  v_used int;
  v_closed int;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_run FROM public.feedback_routine_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_run.status = 'merged' THEN RETURN v_run; END IF;        -- idempotent
  IF v_run.status <> 'fix_proposed' THEN
    RAISE EXCEPTION 'cannot_merge_in_status: %', v_run.status;
  END IF;

  -- Re-verify green (defence in depth — daemon already filtered).
  SELECT count(DISTINCT kind) INTO v_core_passed
    FROM public.feedback_retest_runs
   WHERE routine_run_id = p_run_id AND kind IN ('typecheck','lint','unit') AND status = 'passed';
  SELECT count(*) INTO v_not_passed
    FROM public.feedback_retest_runs
   WHERE routine_run_id = p_run_id AND status <> 'passed';
  IF v_core_passed < 3 OR v_not_passed > 0 THEN
    RAISE EXCEPTION 'retests_not_green';
  END IF;

  -- Merge cap (defence in depth).
  v_cap := public._fb_auto_cap('feedback_auto_merge', 20);
  SELECT count(*) INTO v_used FROM public.feedback_routine_runs
   WHERE merged_at IS NOT NULL AND merged_at >= date_trunc('day', now());
  IF v_used >= v_cap THEN RAISE EXCEPTION 'auto_merge_cap_reached'; END IF;

  UPDATE public.feedback_routine_runs
     SET status = 'merged',
         merge_sha = COALESCE(p_merge_sha, merge_sha),
         merged_at = now(),
         finished_at = COALESCE(finished_at, now())
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  -- Resolve the story + close its member items (mirrors resolve_story close_items=true).
  UPDATE public.feedback_stories
     SET status = 'resolved', resolved_at = COALESCE(resolved_at, now())
   WHERE id = v_run.story_id;

  UPDATE public.community_submissions cs
     SET feedback_status = 'done',
         resolution = COALESCE(cs.resolution, 'fixed'),
         resolved_at = COALESCE(cs.resolved_at, now())
    FROM public.feedback_story_members m
   WHERE m.story_id = v_run.story_id
     AND cs.id = m.submission_id
     AND cs.feedback_status <> 'done';
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  PERFORM _fb_log_event(v_run.story_id, 'merged',
    jsonb_build_object('pr_url', v_run.pr_url, 'merge_sha', v_run.merge_sha),
    'runner', v_run.id);
  PERFORM _fb_log_event(v_run.story_id, 'auto_resolved',
    jsonb_build_object('items_closed', v_closed, 'run_id', v_run.id),
    'runner', v_run.id);

  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_merge(uuid, text) TO authenticated, service_role;

-- ── 9. register automations (enabled = user's all-green choice) ──
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('feedback_auto_dispatch','Auto-dispatch confirmed bug stories',
   'Every 15 min: selects bug-only, settled, un-dispatched feedback stories and dispatches them to the local Claude runner. Daily cap in action.daily_cap.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"edge","fn":"feedback-auto-dispatch","daily_cap":20}'::jsonb, '*/15 * * * *'),
  ('feedback_auto_merge','Auto-merge green fix PRs',
   'Local runner auto-merges autonomous fix PRs once all retests pass, then resolves the story. Kill switch + daily cap (action.daily_cap).',
   'system', true, '{"type":"continuous"}'::jsonb, '[]'::jsonb,
   '{"type":"flag","daily_cap":20}'::jsonb, NULL)
ON CONFLICT (slug) DO UPDATE
  SET description = EXCLUDED.description, action = EXCLUDED.action, schedule = EXCLUDED.schedule;

-- ── 10. cron: feedback-auto-dispatch (internal-secret gated) ─────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='feedback_auto_dispatch') THEN
    PERFORM cron.unschedule('feedback_auto_dispatch');
  END IF;
END $$;
SELECT cron.schedule('feedback_auto_dispatch', '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/feedback-auto-dispatch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('limit', 5),
    timeout_milliseconds := 30000
  ) as request_id;
  $cron$);
