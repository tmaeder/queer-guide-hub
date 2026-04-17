-- Two follow-ups for the P7 story-grouping feature:
--
-- 1. suggest_story_from_ids(uuid[]) — on-demand clustering over a specific
--    submission id set. Used by the admin bulk bar's "Create story" flow
--    so the dialog can pre-fill a title from the selection instead of
--    waiting for the nightly clusterer.
--
-- 2. Cron schedule for the new feedback-story-titler edge function that
--    replaces placeholder titles ("Related feedback cluster" / seed titles)
--    with a 6-word summary via Cloudflare Workers AI Llama 3.3.

-- ── suggest_story_from_ids ──────────────────────────────────────
-- Returns a single row with the proposed title (seed), avg composite score
-- over the pairs inside the set, and the list of eligible member ids
-- (filters out spam / already-done / already-in-open-story items).
CREATE OR REPLACE FUNCTION public.suggest_story_from_ids(
  p_submission_ids uuid[]
) RETURNS TABLE (
  proposed_title text,
  member_ids uuid[],
  avg_similarity real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_eligible uuid[];
  v_avg real;
  v_title text;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF array_length(p_submission_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'submission_ids must not be empty';
  END IF;

  -- Keep only items that are eligible to be grouped.
  SELECT array_agg(cs.id ORDER BY cs.id) INTO v_eligible
    FROM community_submissions cs
   WHERE cs.id = ANY(p_submission_ids)
     AND cs.content_type IN ('feedback','api_error')
     AND cs.duplicate_of IS NULL
     AND cs.is_spam = false
     AND NOT EXISTS (
       SELECT 1 FROM feedback_story_members m
         JOIN feedback_stories s ON s.id = m.story_id
        WHERE m.submission_id = cs.id
          AND s.status NOT IN ('resolved','archived')
     );

  IF v_eligible IS NULL OR array_length(v_eligible, 1) < 2 THEN
    proposed_title := NULL;
    member_ids := COALESCE(v_eligible, ARRAY[]::uuid[]);
    avg_similarity := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Same composite score as detect_feedback_clusters: 0.4*trigram + 0.6*(1-cosine).
  WITH pairs AS (
    SELECT
      GREATEST(
        0.4 * COALESCE(similarity(a.data->>'title', b.data->>'title'), 0)
        + 0.6 * COALESCE(1 - (a.embedding <=> b.embedding), 0),
        0.0
      )::real AS score
    FROM community_submissions a
    JOIN community_submissions b
      ON a.id < b.id
     AND a.id = ANY(v_eligible)
     AND b.id = ANY(v_eligible)
  )
  SELECT avg(score) INTO v_avg FROM pairs;

  -- Seed title: title of the earliest-submitted eligible item. The titler
  -- edge function or admin UI will replace it with something sharper.
  SELECT cs.data->>'title' INTO v_title
    FROM community_submissions cs
   WHERE cs.id = ANY(v_eligible)
   ORDER BY cs.submitted_at ASC
   LIMIT 1;

  proposed_title := COALESCE(v_title, 'Related feedback cluster');
  member_ids := v_eligible;
  avg_similarity := COALESCE(v_avg, 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_story_from_ids(uuid[]) TO authenticated;

-- ── Titler cron ─────────────────────────────────────────────────
-- Runs 4 minutes after the clusterer (which is at 23 3 * * *) so any new
-- cluster suggestions created overnight get a real title before the admin
-- opens the board in the morning.
DO $$
BEGIN
  PERFORM cron.unschedule('feedback-story-titler-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
SELECT cron.schedule(
  'feedback-story-titler-sweep',
  '27 3 * * *',
  $cron$SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/feedback-story-titler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
    body := '{"limit": 30}'::jsonb
  )$cron$
);
