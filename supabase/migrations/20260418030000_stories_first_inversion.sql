-- ===========================================================================
-- Admin feedback — Phase 8: Stories-first inversion
-- ===========================================================================
-- Every community_submissions row lives inside a feedback_story from the
-- moment it's created. 1-member solo stories are fine; the clusterer keeps
-- merging them later. Admins work with stories; per-item surfaces collapse.
--
-- New columns on feedback_stories:
--   brief_title        short 3-6 word label ("Checkout fails for AMEX")
--   narrative          "As a [persona], I [want], so that [value]."
--   narrative_edited   true after an admin edits the narrative manually; the
--                      re-narrate path skips edited stories to avoid stomping
-- ===========================================================================

ALTER TABLE feedback_stories
  ADD COLUMN IF NOT EXISTS brief_title text,
  ADD COLUMN IF NOT EXISTS narrative text,
  ADD COLUMN IF NOT EXISTS narrative_edited boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- auto_story_for_submission(submission_id) — idempotent assignment.
--
-- Match policy (cheap → expensive):
--   1. If the submission is already a member of an active story → no-op.
--   2. If there's an active story with a member that has title trigram
--      similarity >= 0.45, attach to that story.
--   3. If the submission has an embedding, and there's an active story with
--      a member whose cosine similarity >= 0.80, attach there.
--   4. Otherwise, create a new solo story. `title` is seeded from the
--      submission's data->>'title' (or 'message' for api_error rows); the
--      `story-narrate` edge function fills brief_title + narrative async via
--      the trigger below.
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

  -- Trigram match against active-story members' seed titles.
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

  -- Solo story fallback. Seed title = submission title; brief_title +
  -- narrative are backfilled by story-narrate (trigger below).
  INSERT INTO feedback_stories (title, origin)
  VALUES (v_title, CASE WHEN v_submission.content_type = 'api_error' THEN 'ai_suggested' ELSE 'manual' END)
  RETURNING id INTO v_new_story;

  INSERT INTO feedback_story_members (story_id, submission_id)
  VALUES (v_new_story, p_submission_id)
  ON CONFLICT DO NOTHING;

  RETURN v_new_story;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_story_for_submission(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger: newly-inserted feedback/api_error rows auto-get a story.
-- Runs AFTER INSERT so the row is committed to community_submissions; uses
-- pg_net to call the story-narrate edge function for brief_title +
-- narrative synthesis asynchronously.
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
  IF NEW.content_type NOT IN ('feedback', 'api_error') THEN
    RETURN NEW;
  END IF;
  v_story_id := public.auto_story_for_submission(NEW.id);
  IF v_story_id IS NOT NULL THEN
    -- Fire and forget: ask story-narrate to synthesise the brief_title +
    -- narrative. The function itself guards narrative_edited=true.
    PERFORM net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/story-narrate',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
      body := jsonb_build_object('story_id', v_story_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_story_on_insert ON community_submissions;
CREATE TRIGGER trg_auto_story_on_insert
  AFTER INSERT ON community_submissions
  FOR EACH ROW EXECUTE FUNCTION tg_auto_story_on_insert();

-- ---------------------------------------------------------------------------
-- Bidirectional sync: story edits cascade to members; member edits are
-- allowed but get overridden on the next story-level change. The
-- cascade_story_to_members RPC is called explicitly by the client when the
-- admin saves a story edit — that way the "story wins on conflict" rule is
-- visible ("3 members have different status — saving will override").
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cascade_story_to_members(
  p_story_id uuid,
  p_status text DEFAULT NULL,
  p_priority smallint DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_resolution text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_feedback_status text;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Translate story status to the feedback_status the kanban uses. Story
  -- 'open' has no clean kanban analogue; we leave members alone in that case.
  v_feedback_status := CASE p_status
    WHEN 'planned' THEN 'planned'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'resolved' THEN 'done'
    WHEN 'archived' THEN 'done'
    ELSE NULL
  END;

  UPDATE community_submissions cs
     SET feedback_status = COALESCE(v_feedback_status, cs.feedback_status),
         priority        = COALESCE(p_priority, cs.priority),
         assignee_id     = COALESCE(p_assignee_id, cs.assignee_id),
         resolution      = COALESCE(p_resolution, cs.resolution),
         resolved_at     = CASE
                             WHEN p_status IN ('resolved', 'archived') AND cs.resolved_at IS NULL
                             THEN now()
                             ELSE cs.resolved_at
                           END
    FROM feedback_story_members m
   WHERE m.story_id = p_story_id
     AND cs.id = m.submission_id
     AND (
       p_status IS NOT NULL
       OR p_priority IS NOT NULL
       OR p_assignee_id IS NOT NULL
       OR p_resolution IS NOT NULL
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cascade_story_to_members(uuid, text, smallint, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Divergence helper: return the number of members whose current status /
-- priority / assignee doesn't match the story — used by the drawer to show
-- "X members will be overridden if you save".
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION story_member_divergence(p_story_id uuid)
RETURNS TABLE (
  status_diff integer,
  priority_diff integer,
  assignee_diff integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH story AS (
    SELECT status, priority, assignee_id FROM feedback_stories WHERE id = p_story_id
  ),
  members AS (
    SELECT cs.feedback_status, cs.priority, cs.assignee_id
      FROM feedback_story_members m
      JOIN community_submissions cs ON cs.id = m.submission_id
     WHERE m.story_id = p_story_id
  )
  SELECT
    COUNT(*) FILTER (
      WHERE m.feedback_status <> CASE (SELECT status FROM story)
        WHEN 'planned' THEN 'planned'
        WHEN 'in_progress' THEN 'in_progress'
        WHEN 'resolved' THEN 'done'
        WHEN 'archived' THEN 'done'
        ELSE m.feedback_status
      END
    )::integer AS status_diff,
    COUNT(*) FILTER (WHERE m.priority <> (SELECT priority FROM story))::integer AS priority_diff,
    COUNT(*) FILTER (
      WHERE m.assignee_id IS DISTINCT FROM (SELECT assignee_id FROM story)
    )::integer AS assignee_diff
  FROM members m;
$$;

GRANT EXECUTE ON FUNCTION story_member_divergence(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- mark_narrative_edited — client calls this when the admin hand-edits the
-- narrative so subsequent auto-rewrites don't stomp them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_story_narrative(
  p_story_id uuid,
  p_brief_title text,
  p_narrative text,
  p_mark_edited boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE feedback_stories
     SET brief_title = COALESCE(p_brief_title, brief_title),
         narrative   = COALESCE(p_narrative, narrative),
         narrative_edited = CASE WHEN p_mark_edited THEN true ELSE narrative_edited END
   WHERE id = p_story_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_story_narrative(uuid, text, text, boolean) TO authenticated;
