-- Restrict autonomous bug dispatch to genuine user feedback.
--
-- The first pass surfaced that select_auto_dispatch_stories was dispatching
-- api_error-backed stories (CI 'Run failure' captures, single-occurrence 404s)
-- to the fix runner: feedback-autotriage labels every api_error category='bug',
-- so they passed the "all members are bugs" gate. Those aren't agent-fixable
-- main-branch defects — they're infra/branch noise the api_error GC handles.
--
-- The product requirement is "Real Bugs that can be fixed by an agent" — i.e.
-- user-reported feedback. Add an all-members-must-be-feedback gate so only
-- content_type='feedback' bug stories are auto-dispatched. api_error stories
-- stay visible in the Stories tab for manual triage / GC.
--
-- Idempotent CREATE OR REPLACE; no signature change.

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
     -- every member must be a confirmed, non-spam, non-duplicate user-feedback bug.
     -- content_type<>'feedback' excludes api_error stories (CI run-failures, 404s)
     -- which autotriage also labels category='bug' but which aren't agent-fixable.
     AND NOT EXISTS (
       SELECT 1
         FROM public.feedback_story_members m
         JOIN public.community_submissions cs ON cs.id = m.submission_id
        WHERE m.story_id = s.id
          AND ( cs.content_type <> 'feedback'
                OR COALESCE(cs.is_spam, false)
                OR cs.duplicate_of IS NOT NULL
                OR COALESCE(cs.autotriage->>'is_probably_spam','false') = 'true'
                OR COALESCE(cs.autotriage->>'category','') <> 'bug' )
     )
   ORDER BY s.priority ASC, s.created_at ASC
   LIMIT LEAST(p_limit, v_remaining);
END;
$$;

GRANT EXECUTE ON FUNCTION public.select_auto_dispatch_stories(int) TO authenticated, service_role;
