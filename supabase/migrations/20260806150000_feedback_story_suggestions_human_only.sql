-- ===========================================================================
-- Feedback story suggestions — human feedback only
-- ===========================================================================
-- Every open story on /admin/feedback was machine noise wearing a user-report
-- headline. Four GitHub Actions run-failure alerts were bundled as "LGBTQ
-- Safety Concerns"; nine Dependabot alerts as "Safety concerns abroad".
--
-- Two independent defects, both fixed here (the AI-titling half lives in
-- supabase/functions/feedback-story-titler + story-narrate):
--
--  1. INPUT.  detect_feedback_clusters drew its eligible pool from
--     content_type IN ('feedback','api_error'). api_error rows are machine
--     alerts — CI failures, advisor lint, Dependabot — and already have their
--     own API Errors board. The insert-trigger path (tg_auto_story_on_insert)
--     was gated to content_type='feedback' back in 20260619200000, but the
--     nightly clusterer never was, so it kept feeding them in. Result: 74 of
--     the 77 suggestions ever generated contained zero human feedback.
--
--  2. TITLING. Those rows carry their text in data->>'message'; data->>'title'
--     is NULL. The titler read only `title`, so it sent the model an empty
--     list and the model titled from the one thing left in context — the
--     system prompt's "LGBTQ+ travel platform" framing.
--
-- On a platform whose operators triage real LGBTQ+ safety reports, fabricated
-- safety headlines are not cosmetic: they bury genuine reports.
--
-- Machine alerts remain fully visible on the API Errors board — nothing is
-- deleted here, and admins can still bundle an api_error into a story by hand
-- (create_story / add_story_members are untouched). Only the AUTOMATIC
-- clustering path is restricted.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Shared predicate: is this submission a machine alert rather than a human
--    report? content_type is the primary signal; the text patterns catch rows
--    that arrive mislabelled.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.feedback_is_machine_alert(
  p_content_type text,
  p_data jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT p_content_type IS DISTINCT FROM 'feedback'
      OR COALESCE(p_data->>'title', p_data->>'message', '')
           ~* '^\s*((run|workflow|job|build|deploy)\s+failure\s*:|advisor\s*:|\[?dependabot\y|npm_and_yarn\y)';
$$;

COMMENT ON FUNCTION public.feedback_is_machine_alert(text, jsonb) IS
  'True for CI/advisor/Dependabot alerts. Keeps machine noise out of the human Stories board; mirrored in supabase/functions/_shared/story-title-guard.ts.';

-- ---------------------------------------------------------------------------
-- 2. detect_feedback_clusters — cluster HUMAN feedback only.
--    Body transcribed from prod pg_proc.prosrc (2026-08-01); the only change
--    is the `eligible` CTE predicate.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.detect_feedback_clusters(
  p_trigram_threshold real DEFAULT 0.35,
  p_embedding_threshold real DEFAULT 0.78,
  p_days_window integer DEFAULT 90,
  p_min_cluster_size integer DEFAULT 3
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_inserted integer := 0;
  v_row RECORD;
  v_parent jsonb := '{}'::jsonb;
  v_key_a text;
  v_key_b text;
  v_root_a text;
  v_root_b text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _fb_pairs(
    a_id uuid, b_id uuid, score real
  ) ON COMMIT DROP;
  TRUNCATE _fb_pairs;

  INSERT INTO _fb_pairs(a_id, b_id, score)
  WITH eligible AS (
    -- Human feedback only. api_error rows (CI failures, advisor lint,
    -- Dependabot) are tracked on the API Errors board; clustering them here
    -- produced 74/77 all-machine suggestions and fake safety stories.
    SELECT id, COALESCE(data->>'title', data->>'message') AS title, embedding
      FROM community_submissions
     WHERE content_type = 'feedback'
       AND NOT feedback_is_machine_alert(content_type, data)
       AND duplicate_of IS NULL
       AND is_spam = false
       AND submitted_at > now() - make_interval(days => p_days_window)
       AND feedback_status <> 'done'
       AND NOT EXISTS (
         SELECT 1 FROM feedback_story_members m
          JOIN feedback_stories s ON s.id = m.story_id
         WHERE m.submission_id = community_submissions.id
           AND s.status NOT IN ('resolved','archived')
       )
  )
  SELECT LEAST(a.id, b.id),
         GREATEST(a.id, b.id),
         GREATEST(
           0.4 * COALESCE(similarity(a.title, b.title), 0)
           + 0.6 * COALESCE(1 - (a.embedding <=> b.embedding), 0),
           0.0
         )::real AS score
    FROM eligible a
    JOIN eligible b
      ON a.id < b.id
     AND (
       similarity(a.title, b.title) >= p_trigram_threshold
       OR (a.embedding IS NOT NULL
           AND b.embedding IS NOT NULL
           AND (1 - (a.embedding <=> b.embedding)) >= p_embedding_threshold)
     );

  DELETE FROM _fb_pairs WHERE score < 0.45;

  FOR v_row IN SELECT a_id, b_id FROM _fb_pairs LOOP
    v_key_a := v_row.a_id::text;
    v_key_b := v_row.b_id::text;
    v_root_a := COALESCE(v_parent->>v_key_a, v_key_a);
    WHILE v_root_a <> COALESCE(v_parent->>v_root_a, v_root_a) LOOP
      v_root_a := v_parent->>v_root_a;
    END LOOP;
    v_root_b := COALESCE(v_parent->>v_key_b, v_key_b);
    WHILE v_root_b <> COALESCE(v_parent->>v_root_b, v_root_b) LOOP
      v_root_b := v_parent->>v_root_b;
    END LOOP;
    IF v_root_a <> v_root_b THEN
      v_parent := jsonb_set(v_parent, ARRAY[v_root_a], to_jsonb(v_root_b));
    END IF;
    v_parent := jsonb_set(v_parent, ARRAY[v_key_a], to_jsonb(v_root_b));
    v_parent := jsonb_set(v_parent, ARRAY[v_key_b], to_jsonb(v_root_b));
  END LOOP;

  INSERT INTO feedback_story_suggestions (
    proposed_title, member_ids, avg_similarity, method
  )
  WITH roots AS (
    SELECT key::uuid AS member_id, value #>> '{}' AS root
      FROM jsonb_each(v_parent)
  ),
  clusters AS (
    SELECT root, array_agg(member_id ORDER BY member_id) AS ids
      FROM roots
     GROUP BY root
    HAVING count(*) >= p_min_cluster_size
  ),
  scored AS (
    SELECT c.ids,
           (SELECT avg(score) FROM _fb_pairs p
             WHERE p.a_id = ANY(c.ids) AND p.b_id = ANY(c.ids))::real AS avg_score,
           (SELECT COALESCE(cs.data->>'title', cs.data->>'message')
              FROM community_submissions cs
             WHERE cs.id = c.ids[1] LIMIT 1) AS seed_title
      FROM clusters c
  )
  SELECT
    COALESCE(seed_title, 'Related feedback cluster') AS proposed_title,
    ids,
    COALESCE(avg_score, 0.5),
    'hybrid'
  FROM scored
  WHERE NOT EXISTS (
    SELECT 1 FROM feedback_story_suggestions existing
     WHERE existing.dismissed = false
       AND existing.member_ids @> scored.ids
       AND scored.ids @> existing.member_ids
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. accept_story_suggestion — refuse an all-machine cluster.
--    Defence in depth: 77 historical suggestions predate the filter above, and
--    a stale board tab can still hold one. Body transcribed from prod prosrc.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_story_suggestion(
  p_suggestion_id uuid,
  p_override_title text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- A cluster with no human report in it belongs on the API Errors board.
  IF NOT EXISTS (
    SELECT 1 FROM community_submissions cs
     WHERE cs.id = ANY(v_sugg.member_ids)
       AND NOT feedback_is_machine_alert(cs.content_type, cs.data)
  ) THEN
    RAISE EXCEPTION 'machine_alert_cluster: this suggestion contains only infrastructure alerts — triage it on the API Errors board';
  END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.accept_story_suggestion(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Re-triage the existing board (reversible — unarchive_story restores any
--    of these, and no submission row is touched).
-- ---------------------------------------------------------------------------

-- 4a. Archive machine-alert-only stories, and scrub the title only where the
--     AI asserted a safety/identity theme its own members never mention.
--     Grounded titles ("Page not found errors") are kept as-is; a fabricated
--     one ("LGBTQ Safety Concerns") would otherwise keep displaying a fake
--     safety incident in the archive panel. The original is preserved in
--     archive_reason for the audit trail.
WITH machine_only AS (
  SELECT s.id,
         s.title AS old_title,
         s.narrative_edited,
         (SELECT COALESCE(cs.data->>'title', cs.data->>'message')
            FROM feedback_story_members m
            JOIN community_submissions cs ON cs.id = m.submission_id
           WHERE m.story_id = s.id
           ORDER BY cs.submitted_at
           LIMIT 1) AS seed_text,
         (SELECT string_agg(COALESCE(cs.data->>'title', cs.data->>'message', ''), ' ')
            FROM feedback_story_members m
            JOIN community_submissions cs ON cs.id = m.submission_id
           WHERE m.story_id = s.id) AS member_corpus
    FROM feedback_stories s
   WHERE s.status IN ('open', 'in_progress')
     AND EXISTS (SELECT 1 FROM feedback_story_members m WHERE m.story_id = s.id)
     AND NOT EXISTS (
       SELECT 1 FROM feedback_story_members m
         JOIN community_submissions cs ON cs.id = m.submission_id
        WHERE m.story_id = s.id
          AND NOT feedback_is_machine_alert(cs.content_type, cs.data))
),
judged AS (
  SELECT mo.*,
         -- Mirrors ungroundedSensitiveConcepts() in
         -- supabase/functions/_shared/story-title-guard.ts.
         (mo.old_title ~* '\y(safe|safety|safer|unsafe|danger\w*|risk\w*|threat\w*|violen\w*|assault\w*|abus\w*|harass\w*|discriminat\w*|homophob\w*|transphob\w*|hate|lgbt\w*|queer|gay|lesbian|bisexual|trans|transgender|nonbinary|intersex|pride|outing|outed|closeted|crisis|emergency|suicid\w*)\y'
          AND COALESCE(mo.member_corpus, '') !~* '\y(safe|safety|safer|unsafe|danger\w*|risk\w*|threat\w*|violen\w*|assault\w*|abus\w*|harass\w*|discriminat\w*|homophob\w*|transphob\w*|hate|lgbt\w*|queer|gay|lesbian|bisexual|trans|transgender|nonbinary|intersex|pride|outing|outed|closeted|crisis|emergency|suicid\w*)\y'
         ) AS title_ungrounded
    FROM machine_only mo
)
UPDATE feedback_stories s
   SET title = CASE WHEN j.title_ungrounded
                    THEN COALESCE(NULLIF(j.seed_text, ''), 'Infrastructure alerts')
                    ELSE s.title END,
       brief_title = CASE WHEN j.narrative_edited THEN s.brief_title ELSE NULL END,
       narrative   = CASE WHEN j.narrative_edited THEN s.narrative   ELSE NULL END,
       status = 'archived',
       archived_at = now(),
       archive_reason = 'auto: infrastructure-alert-only story — triage on the API Errors board.'
                        || CASE WHEN j.title_ungrounded
                                THEN ' AI-proposed title was ' || quote_literal(j.old_title)
                                     || ' (ungrounded safety theme; see migration 20260806150000).'
                                ELSE '' END
  FROM judged j
 WHERE s.id = j.id;

-- 4b. Dismiss any still-open all-machine suggestion so the fixed clusterer
--     starts from a clean board.
UPDATE feedback_story_suggestions sg
   SET dismissed = true, dismissed_at = now()
 WHERE sg.dismissed = false
   AND NOT EXISTS (
     SELECT 1 FROM community_submissions cs
      WHERE cs.id = ANY(sg.member_ids)
        AND NOT feedback_is_machine_alert(cs.content_type, cs.data));
