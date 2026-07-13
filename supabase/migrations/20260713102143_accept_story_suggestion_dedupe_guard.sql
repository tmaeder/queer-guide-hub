-- Guard accept_story_suggestion against duplicate stories (2026-07-04 incident:
-- a bulk accept of overlapping stale suggestions created 23 near-identical
-- open stories sharing up to 95% of members). Members already in an active
-- story are stripped from the accepted set; if nothing meaningful remains,
-- the suggestion is dismissed and the best-overlapping active story is
-- returned instead of creating a duplicate.
CREATE OR REPLACE FUNCTION public.accept_story_suggestion(p_suggestion_id uuid, p_override_title text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sugg RECORD;
  v_story_id uuid;
  v_new_members uuid[];
  v_best_existing uuid;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_sugg FROM feedback_story_suggestions
   WHERE id = p_suggestion_id AND dismissed = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'suggestion not found'; END IF;

  -- Only members not already covered by an active story seed a new one.
  SELECT coalesce(array_agg(mid), '{}') INTO v_new_members
  FROM unnest(v_sugg.member_ids) AS mid
  WHERE NOT EXISTS (
    SELECT 1 FROM feedback_story_members m
    JOIN feedback_stories s ON s.id = m.story_id
    WHERE m.submission_id = mid AND s.status NOT IN ('resolved','archived')
  );

  IF coalesce(array_length(v_new_members, 1), 0) >= 2 THEN
    v_story_id := create_story(
      COALESCE(p_override_title, v_sugg.proposed_title),
      v_new_members,
      NULL,
      'ai_suggested'
    );
  ELSE
    -- Suggestion is (almost) fully covered — attach any straggler to the
    -- active story with the largest member overlap instead of duplicating.
    SELECT s.id INTO v_best_existing
    FROM feedback_stories s
    JOIN feedback_story_members m ON m.story_id = s.id
    WHERE s.status NOT IN ('resolved','archived')
      AND m.submission_id = ANY(v_sugg.member_ids)
    GROUP BY s.id
    ORDER BY count(*) DESC, s.created_at DESC
    LIMIT 1;

    IF v_best_existing IS NOT NULL AND coalesce(array_length(v_new_members, 1), 0) > 0 THEN
      INSERT INTO feedback_story_members (story_id, submission_id)
      SELECT v_best_existing, unnest(v_new_members)
      ON CONFLICT DO NOTHING;
    END IF;
    v_story_id := v_best_existing;
  END IF;

  UPDATE feedback_story_suggestions
     SET dismissed = true, dismissed_at = now(), dismissed_by = auth.uid()
   WHERE id = p_suggestion_id;

  RETURN v_story_id;
END;
$function$;
