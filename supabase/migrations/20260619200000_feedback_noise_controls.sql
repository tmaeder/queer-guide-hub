-- ===========================================================================
-- Admin feedback — noise controls (Phase A of the /admin/feedback cleanup)
-- ===========================================================================
-- The feedback board was ~770 open items, but ~660 were machine noise, not
-- human reports:
--   * ~298 GitHub CI failures on ephemeral branches (claude/*, dependabot/*)
--     that never auto-resolve because the branch is deleted.
--   * ~360 Supabase advisor lint WARN/INFO findings (self-gated SECURITY
--     DEFINER RPCs, search_path, perf-policy backlog) — not actionable errors.
--   * 38 stories that wrap only api_error rows (machine errors don't belong on
--     the human Stories board).
--
-- This migration: (1) stops api_error rows from auto-spawning stories, (2) adds
-- an exact-title dedup guard so identical reports don't each create a solo
-- story, (3) one-time-resolves the existing noise backlog (reversible — status
-- flips, audited via community_submissions_audit), (4) fixes a cron collision.
--
-- The edge-side prevention lives in:
--   * supabase/functions/sync-supabase-advisors/index.ts  (advisor filter)
--   * supabase/functions/github-webhook/index.ts          (default-branch gate)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. auto_story_for_submission — add an exact-title dedup guard before the
--    solo-story fallback. The existing trigram/embedding passes match against
--    member seed titles; identical raw titles (e.g. repeated "Failed to fetch
--    events") could still each spawn their own solo story because trigram
--    similarity of identical-but-short strings can sit under 0.45. Match an
--    open story by normalized title first.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auto_story_for_submission(p_submission_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_submission record;
  v_title text;
  v_embedding vector(768);
  v_match_story uuid;
  v_new_story uuid;
BEGIN
  SELECT id, content_type, data, embedding, feedback_status, is_spam, duplicate_of
    INTO v_submission
    FROM community_submissions
   WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Skip spam + duplicates; they shouldn't become primary story seeds.
  IF v_submission.is_spam OR v_submission.duplicate_of IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- No-op if already assigned to an active story.
  SELECT m.story_id INTO v_match_story
    FROM feedback_story_members m
    JOIN feedback_stories s ON s.id = m.story_id
   WHERE m.submission_id = p_submission_id
     AND s.status NOT IN ('resolved', 'archived')
   LIMIT 1;
  IF v_match_story IS NOT NULL THEN
    RETURN v_match_story;
  END IF;

  v_title := COALESCE(
    NULLIF(v_submission.data->>'title', ''),
    NULLIF(v_submission.data->>'message', ''),
    'Untitled'
  );
  v_embedding := v_submission.embedding;

  -- Exact normalized-title match against any active story (title OR the
  -- AI-narrated brief_title). Cheapest, and catches identical reports.
  SELECT s.id INTO v_match_story
    FROM feedback_stories s
   WHERE s.status NOT IN ('resolved', 'archived')
     AND lower(btrim(COALESCE(s.brief_title, s.title))) = lower(btrim(v_title))
   ORDER BY s.created_at ASC
   LIMIT 1;

  -- Trigram match against active-story members' seed titles.
  IF v_match_story IS NULL THEN
    SELECT s.id INTO v_match_story
      FROM feedback_stories s
      JOIN feedback_story_members m ON m.story_id = s.id
      JOIN community_submissions cs ON cs.id = m.submission_id
     WHERE s.status NOT IN ('resolved', 'archived')
       AND similarity(
             COALESCE(cs.data->>'title', cs.data->>'message', ''),
             v_title
           ) >= 0.45
     ORDER BY similarity(
               COALESCE(cs.data->>'title', cs.data->>'message', ''),
               v_title
             ) DESC
     LIMIT 1;
  END IF;

  -- Embedding match (only if the trigram pass didn't find anything).
  IF v_match_story IS NULL AND v_embedding IS NOT NULL THEN
    SELECT s.id INTO v_match_story
      FROM feedback_stories s
      JOIN feedback_story_members m ON m.story_id = s.id
      JOIN community_submissions cs ON cs.id = m.submission_id
     WHERE s.status NOT IN ('resolved', 'archived')
       AND cs.embedding IS NOT NULL
       AND (1 - (cs.embedding <=> v_embedding)) >= 0.80
     ORDER BY (cs.embedding <=> v_embedding) ASC
     LIMIT 1;
  END IF;

  IF v_match_story IS NOT NULL THEN
    INSERT INTO feedback_story_members (story_id, submission_id)
    VALUES (v_match_story, p_submission_id)
    ON CONFLICT DO NOTHING;
    RETURN v_match_story;
  END IF;

  -- Solo story fallback.
  INSERT INTO feedback_stories (title, origin)
  VALUES (v_title, CASE WHEN v_submission.content_type = 'api_error' THEN 'ai_suggested' ELSE 'manual' END)
  RETURNING id INTO v_new_story;

  INSERT INTO feedback_story_members (story_id, submission_id)
  VALUES (v_new_story, p_submission_id)
  ON CONFLICT DO NOTHING;

  RETURN v_new_story;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. tg_auto_story_on_insert — only auto-spawn stories for HUMAN feedback.
--    api_error rows (advisor lint, GitHub CI failures, runtime errors) live on
--    the dedicated API Errors board; they must not clutter the Stories board.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tg_auto_story_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story_id uuid;
BEGIN
  IF NEW.content_type <> 'feedback' THEN
    RETURN NEW;
  END IF;
  v_story_id := public.auto_story_for_submission(NEW.id);
  IF v_story_id IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/story-narrate',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
      body := jsonb_build_object('story_id', v_story_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. One-time backlog cleanup (reversible: admins can reopen any row/story).
-- ---------------------------------------------------------------------------

-- 3a. Resolve advisor lint rows that the new filter would no longer ingest.
UPDATE community_submissions
   SET feedback_status = 'done', resolution = 'invalid', resolved_at = now()
 WHERE content_type = 'api_error'
   AND feedback_status <> 'done'
   AND fingerprint LIKE 'advisor:%'
   AND (
        data->'metadata'->>'severity' = 'INFO'
     OR (data->'metadata'->>'advisor_type' = 'performance'
         AND COALESCE(data->'metadata'->>'severity','') <> 'ERROR')
     OR (data->'metadata'->>'advisor_type' = 'security'
         AND data->'metadata'->>'severity' = 'WARN'
         AND data->'metadata'->>'rule' IN (
              'authenticated_security_definer_function_executable',
              'anon_security_definer_function_executable',
              'function_search_path_mutable'))
   );

-- 3b. Resolve GitHub CI failures on non-default branches (ephemeral; will never
--     receive a success event because the branch is gone).
UPDATE community_submissions
   SET feedback_status = 'done', resolution = 'invalid', resolved_at = now()
 WHERE content_type = 'api_error'
   AND feedback_status <> 'done'
   AND fingerprint LIKE 'gh-actions:%'
   AND data->'metadata'->>'branch' IS NOT NULL
   AND data->'metadata'->>'branch' <> 'main';

-- 3c. Archive open stories whose members are ALL api_error rows (machine noise
--     that should never have become a story).
UPDATE feedback_stories s
   SET status = 'archived',
       archived_at = now(),
       archive_reason = 'auto: api_error-only story — tracked on the API Errors board, not Stories'
 WHERE s.status IN ('open', 'in_progress')
   AND EXISTS (SELECT 1 FROM feedback_story_members m WHERE m.story_id = s.id)
   AND NOT EXISTS (
        SELECT 1 FROM feedback_story_members m
          JOIN community_submissions cs ON cs.id = m.submission_id
         WHERE m.story_id = s.id AND cs.content_type <> 'api_error');

-- 3d. Resolve open stories whose every member is already done (work finished).
UPDATE feedback_stories s
   SET status = 'resolved', resolved_at = COALESCE(s.resolved_at, now())
 WHERE s.status IN ('open', 'in_progress')
   AND EXISTS (SELECT 1 FROM feedback_story_members m WHERE m.story_id = s.id)
   AND NOT EXISTS (
        SELECT 1 FROM feedback_story_members m
          JOIN community_submissions cs ON cs.id = m.submission_id
         WHERE m.story_id = s.id AND COALESCE(cs.feedback_status,'new') <> 'done');

-- ---------------------------------------------------------------------------
-- 4. Fix the cron collision: auto-escalate-stale-feedback and
--    feedback-story-titler-sweep both ran at 27 3 * * *. Move the former.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-escalate-stale-feedback') THEN
    UPDATE cron.job SET schedule = '33 3 * * *' WHERE jobname = 'auto-escalate-stale-feedback';
  END IF;
END $$;
