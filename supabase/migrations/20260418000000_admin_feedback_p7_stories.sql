-- Admin feedback overhaul — Phase 7 (Stories)
-- Bundle N related feedback items and api_error rows into a single
-- "Story" so admins can triage / hand-off / resolve them in one go.
-- A Story is a tag: member items keep their own independent statuses.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Embeddings on submissions ───────────────────────────────────
-- Reuses the project's existing Cloudflare Workers AI bge-base-en-v1.5
-- (768 dims) pipeline. The column is populated by the feedback-embed
-- edge function on insert/update (pg_net webhook) + nightly sweep.
ALTER TABLE community_submissions
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS idx_cs_embedding
  ON community_submissions USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE embedding IS NOT NULL;

-- ── feedback_stories ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'planned', 'in_progress', 'resolved', 'archived')),
  priority smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 3),
  labels text[] NOT NULL DEFAULT '{}',
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  origin text NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual', 'ai_suggested')),
  handoffs jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_feedback_stories_status_priority
  ON feedback_stories (status, priority);
CREATE INDEX IF NOT EXISTS idx_feedback_stories_assignee
  ON feedback_stories (assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_stories_labels
  ON feedback_stories USING GIN (labels);
CREATE INDEX IF NOT EXISTS idx_feedback_stories_title_trgm
  ON feedback_stories USING GIN (title gin_trgm_ops);

CREATE OR REPLACE FUNCTION tg_feedback_stories_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_stories_touch ON feedback_stories;
CREATE TRIGGER trg_feedback_stories_touch
  BEFORE UPDATE ON feedback_stories
  FOR EACH ROW EXECUTE FUNCTION tg_feedback_stories_touch();

ALTER TABLE feedback_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stories_admins_read ON feedback_stories;
CREATE POLICY stories_admins_read ON feedback_stories
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS stories_admins_write ON feedback_stories;
CREATE POLICY stories_admins_write ON feedback_stories
  FOR ALL TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

-- ── feedback_story_members ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_story_members (
  story_id uuid NOT NULL REFERENCES feedback_stories(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES community_submissions(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confidence real,
  PRIMARY KEY (story_id, submission_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_story_members_submission
  ON feedback_story_members (submission_id);

ALTER TABLE feedback_story_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS story_members_admins_read ON feedback_story_members;
CREATE POLICY story_members_admins_read ON feedback_story_members
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS story_members_admins_write ON feedback_story_members;
CREATE POLICY story_members_admins_write ON feedback_story_members
  FOR ALL TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

-- ── feedback_story_suggestions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_story_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_title text NOT NULL,
  member_ids uuid[] NOT NULL,
  avg_similarity real NOT NULL CHECK (avg_similarity >= 0 AND avg_similarity <= 1),
  method text NOT NULL CHECK (method IN ('trigram', 'embedding', 'hybrid')),
  dismissed boolean NOT NULL DEFAULT false,
  dismissed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_story_suggestions_open
  ON feedback_story_suggestions (created_at DESC)
  WHERE dismissed = false;

ALTER TABLE feedback_story_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS story_sugg_admins_read ON feedback_story_suggestions;
CREATE POLICY story_sugg_admins_read ON feedback_story_suggestions
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS story_sugg_admins_update ON feedback_story_suggestions;
CREATE POLICY story_sugg_admins_update ON feedback_story_suggestions
  FOR UPDATE TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS story_sugg_service_insert ON feedback_story_suggestions;
CREATE POLICY story_sugg_service_insert ON feedback_story_suggestions
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ── RPCs ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_story(
  p_title text,
  p_submission_ids uuid[],
  p_summary text DEFAULT NULL,
  p_origin text DEFAULT 'manual'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF array_length(p_submission_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'submission_ids must not be empty';
  END IF;

  INSERT INTO feedback_stories (title, summary, created_by, origin)
  VALUES (p_title, p_summary, v_actor, p_origin)
  RETURNING id INTO v_story_id;

  INSERT INTO feedback_story_members (story_id, submission_id, added_by)
  SELECT v_story_id, unnest, v_actor
  FROM unnest(p_submission_ids)
  ON CONFLICT DO NOTHING;

  RETURN v_story_id;
END;
$$;

CREATE OR REPLACE FUNCTION add_story_members(
  p_story_id uuid,
  p_submission_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_count integer;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO feedback_story_members (story_id, submission_id, added_by)
  SELECT p_story_id, unnest, v_actor
  FROM unnest(p_submission_ids)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION remove_story_members(
  p_story_id uuid,
  p_submission_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM feedback_story_members
  WHERE story_id = p_story_id
    AND submission_id = ANY(p_submission_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_story(
  p_story_id uuid,
  p_close_items boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed integer := 0;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE feedback_stories
     SET status = 'resolved',
         resolved_at = now()
   WHERE id = p_story_id;

  IF p_close_items THEN
    UPDATE community_submissions cs
       SET feedback_status = 'done',
           resolution = COALESCE(cs.resolution, 'fixed'),
           resolved_at = COALESCE(cs.resolved_at, now())
      FROM feedback_story_members m
     WHERE m.story_id = p_story_id
       AND cs.id = m.submission_id
       AND cs.feedback_status <> 'done';
    GET DIAGNOSTICS v_closed = ROW_COUNT;
  END IF;

  RETURN v_closed;
END;
$$;

CREATE OR REPLACE FUNCTION accept_story_suggestion(
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
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_sugg FROM feedback_story_suggestions
   WHERE id = p_suggestion_id AND dismissed = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'suggestion not found'; END IF;

  v_story_id := create_story(
    COALESCE(p_override_title, v_sugg.proposed_title),
    v_sugg.member_ids,
    NULL,
    'ai_suggested'
  );

  UPDATE feedback_story_suggestions
     SET dismissed = true, dismissed_at = now(), dismissed_by = auth.uid()
   WHERE id = p_suggestion_id;

  RETURN v_story_id;
END;
$$;

-- ── Hybrid clusterer ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION detect_feedback_clusters(
  p_trigram_threshold real DEFAULT 0.35,
  p_embedding_threshold real DEFAULT 0.78,
  p_days_window integer DEFAULT 90,
  p_min_cluster_size integer DEFAULT 3
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    SELECT id, data->>'title' AS title, embedding
      FROM community_submissions
     WHERE content_type IN ('feedback','api_error')
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
           (SELECT cs.data->>'title' FROM community_submissions cs
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

DO $$
BEGIN
  PERFORM cron.unschedule('detect-feedback-clusters');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
SELECT cron.schedule(
  'detect-feedback-clusters',
  '23 3 * * *',
  $cron$SELECT public.detect_feedback_clusters(0.35, 0.78, 90, 3)$cron$
);

-- ── Audit hook for membership ──────────────────────────────────
CREATE OR REPLACE FUNCTION tg_audit_story_member() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO community_submissions_audit
      (submission_id, actor_id, field, old_value, new_value, at)
    VALUES
      (NEW.submission_id, NEW.added_by, 'story', NULL, to_jsonb(NEW.story_id), now());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO community_submissions_audit
      (submission_id, actor_id, field, old_value, new_value, at)
    VALUES
      (OLD.submission_id, auth.uid(), 'story', to_jsonb(OLD.story_id), NULL, now());
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_story_member ON feedback_story_members;
CREATE TRIGGER trg_audit_story_member
  AFTER INSERT OR DELETE ON feedback_story_members
  FOR EACH ROW EXECUTE FUNCTION tg_audit_story_member();

GRANT EXECUTE ON FUNCTION create_story(text, uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION add_story_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_story_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_story(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_story_suggestion(uuid, text) TO authenticated;

-- ── Embedding auto-refresh trigger ─────────────────────────────
CREATE OR REPLACE FUNCTION notify_feedback_embed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.content_type NOT IN ('feedback','api_error') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.data::text = NEW.data::text
     AND NEW.embedding IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/feedback-embed',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
    body := jsonb_build_object('submission_ids', ARRAY[NEW.id::text])
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_feedback_embed ON community_submissions;
CREATE TRIGGER trg_notify_feedback_embed
  AFTER INSERT OR UPDATE OF data ON community_submissions
  FOR EACH ROW EXECUTE FUNCTION notify_feedback_embed();

DO $$
BEGIN
  PERFORM cron.unschedule('feedback-embed-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
SELECT cron.schedule(
  'feedback-embed-sweep',
  '41 3 * * *',
  $cron$SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/feedback-embed',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
    body := '{"limit": 1000}'::jsonb
  )$cron$
);
