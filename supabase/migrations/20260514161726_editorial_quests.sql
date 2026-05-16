-- Editorial Quests: curated time-bounded community challenges
-- See docs strategy: editorial quests (one/month, hand-curated)

-- ── 1. quests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  brief_md text NOT NULL DEFAULT '',
  theme text,
  hero_image_url text,
  -- criteria_json: { entity_type: 'venue'|'event'|'personality'|'news'|'place',
  --                  target_count: int, tags: text[], region: text? , notes: text? }
  criteria_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  recap_article_id uuid REFERENCES public.news_articles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quests_status_chk CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'archived')),
  CONSTRAINT quests_dates_chk CHECK (ends_at > starts_at),
  CONSTRAINT quests_slug_format_chk CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$')
);

CREATE INDEX IF NOT EXISTS quests_status_idx ON public.quests(status);
CREATE INDEX IF NOT EXISTS quests_active_window_idx ON public.quests(starts_at, ends_at)
  WHERE status = 'active';

COMMENT ON TABLE public.quests IS 'Editorial Quests — time-bounded curated community challenges. One/month, hand-curated.';
COMMENT ON COLUMN public.quests.criteria_json IS 'Shape: {entity_type, target_count, tags[], region, notes}. Free-form for editorial flexibility.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_quests_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS quests_set_updated_at ON public.quests;
CREATE TRIGGER quests_set_updated_at BEFORE UPDATE ON public.quests
  FOR EACH ROW EXECUTE FUNCTION public.tg_quests_set_updated_at();

-- ── 2. quest_participations ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quest_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  opted_in_public boolean NOT NULL DEFAULT false,
  display_name text,
  progress_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, quest_id)
);

CREATE INDEX IF NOT EXISTS quest_participations_quest_idx ON public.quest_participations(quest_id);
CREATE INDEX IF NOT EXISTS quest_participations_user_idx ON public.quest_participations(user_id);

-- ── 3. quest_contributions ───────────────────────────────────────────────
-- Links a community_submission (or already-committed entity) to a quest.
CREATE TABLE IF NOT EXISTS public.quest_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES public.community_submissions(id) ON DELETE SET NULL,
  -- Once a submission is promoted, these reference the live entity:
  entity_table text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quest_contributions_status_chk CHECK (status IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT quest_contributions_link_chk CHECK (submission_id IS NOT NULL OR entity_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS quest_contributions_quest_idx ON public.quest_contributions(quest_id);
CREATE INDEX IF NOT EXISTS quest_contributions_user_idx ON public.quest_contributions(user_id);
CREATE INDEX IF NOT EXISTS quest_contributions_submission_idx ON public.quest_contributions(submission_id);

-- ── 4. community_submissions: optional quest link ────────────────────────
ALTER TABLE public.community_submissions
  ADD COLUMN IF NOT EXISTS quest_id uuid REFERENCES public.quests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS community_submissions_quest_idx ON public.community_submissions(quest_id)
  WHERE quest_id IS NOT NULL;

-- Auto-tag new submissions with the active quest if the submitter has joined
-- and the content_type matches the quest's entity_type. BEFORE insert so the
-- contribution-mirror trigger (AFTER insert) sees the populated quest_id.
CREATE OR REPLACE FUNCTION public.tg_submission_autotag_quest()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_quest public.quests%ROWTYPE;
  v_joined boolean;
BEGIN
  IF NEW.quest_id IS NOT NULL OR NEW.submitted_by IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_quest FROM public.quests
   WHERE status = 'active' AND now() BETWEEN starts_at AND ends_at
   ORDER BY starts_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Match content_type loosely to entity_type (venue/event/personality/news/place)
  IF v_quest.criteria_json ? 'entity_type'
     AND NEW.content_type IS DISTINCT FROM (v_quest.criteria_json->>'entity_type') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.quest_participations
     WHERE quest_id = v_quest.id AND user_id = NEW.submitted_by
  ) INTO v_joined;
  IF NOT v_joined THEN RETURN NEW; END IF;

  NEW.quest_id := v_quest.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS submission_autotag_quest ON public.community_submissions;
CREATE TRIGGER submission_autotag_quest
  BEFORE INSERT ON public.community_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_submission_autotag_quest();

-- Auto-mirror submissions tagged with quest_id into quest_contributions
CREATE OR REPLACE FUNCTION public.tg_submission_quest_contribution()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quest_id IS NULL THEN RETURN NEW; END IF;

  IF (TG_OP = 'INSERT') OR (OLD.quest_id IS DISTINCT FROM NEW.quest_id) THEN
    INSERT INTO public.quest_contributions (quest_id, user_id, submission_id, status)
    VALUES (NEW.quest_id, NEW.submitted_by, NEW.id,
      CASE WHEN NEW.status = 'approved' THEN 'accepted'
           WHEN NEW.status = 'rejected' THEN 'rejected'
           ELSE 'pending' END)
    ON CONFLICT DO NOTHING;
  ELSIF (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.quest_contributions
      SET status = CASE WHEN NEW.status = 'approved' THEN 'accepted'
                        WHEN NEW.status = 'rejected' THEN 'rejected'
                        ELSE 'pending' END,
          entity_table = NEW.promoted_to_table,
          entity_id = NEW.promoted_to_id
      WHERE submission_id = NEW.id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS submission_quest_contribution ON public.community_submissions;
CREATE TRIGGER submission_quest_contribution
  AFTER INSERT OR UPDATE OF quest_id, status, promoted_to_id ON public.community_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_submission_quest_contribution();

-- ── 5. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_contributions ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-draft quests
DROP POLICY IF EXISTS quests_read ON public.quests;
CREATE POLICY quests_read ON public.quests FOR SELECT TO anon, authenticated
  USING (status <> 'draft');

-- Admins/mods do everything via service role or is_admin helper if present
DROP POLICY IF EXISTS quests_admin_all ON public.quests;
CREATE POLICY quests_admin_all ON public.quests FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Participations: owner can read+write own; public can read opted-in
DROP POLICY IF EXISTS quest_participations_read_own ON public.quest_participations;
CREATE POLICY quest_participations_read_own ON public.quest_participations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS quest_participations_read_public ON public.quest_participations;
CREATE POLICY quest_participations_read_public ON public.quest_participations
  FOR SELECT TO anon, authenticated USING (opted_in_public = true);

DROP POLICY IF EXISTS quest_participations_insert_own ON public.quest_participations;
CREATE POLICY quest_participations_insert_own ON public.quest_participations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS quest_participations_update_own ON public.quest_participations;
CREATE POLICY quest_participations_update_own ON public.quest_participations
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS quest_participations_delete_own ON public.quest_participations;
CREATE POLICY quest_participations_delete_own ON public.quest_participations
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Contributions: read everything (counts on public pages); writes via trigger/admin only
DROP POLICY IF EXISTS quest_contributions_read ON public.quest_contributions;
CREATE POLICY quest_contributions_read ON public.quest_contributions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS quest_contributions_admin_write ON public.quest_contributions;
CREATE POLICY quest_contributions_admin_write ON public.quest_contributions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.quests TO anon, authenticated;
GRANT SELECT ON public.quest_participations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.quest_participations TO authenticated;
GRANT SELECT ON public.quest_contributions TO anon, authenticated;

-- ── 6. Helper RPCs ───────────────────────────────────────────────────────

-- Currently active quest (one expected; returns latest if multiple)
CREATE OR REPLACE FUNCTION public.active_quest()
RETURNS public.quests
LANGUAGE sql STABLE AS $$
  SELECT * FROM public.quests
   WHERE status = 'active' AND now() BETWEEN starts_at AND ends_at
   ORDER BY starts_at DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.active_quest() TO anon, authenticated;

-- Quest progress: count of accepted contributions vs target_count
CREATE OR REPLACE FUNCTION public.quest_progress(p_quest_id uuid)
RETURNS TABLE (accepted_count bigint, pending_count bigint, contributor_count bigint, target_count int)
LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(*) FILTER (WHERE qc.status = 'accepted')::bigint AS accepted_count,
    COUNT(*) FILTER (WHERE qc.status = 'pending')::bigint  AS pending_count,
    COUNT(DISTINCT qc.user_id) FILTER (WHERE qc.status = 'accepted')::bigint AS contributor_count,
    COALESCE((q.criteria_json->>'target_count')::int, 0) AS target_count
  FROM public.quests q
  LEFT JOIN public.quest_contributions qc ON qc.quest_id = q.id
  WHERE q.id = p_quest_id
  GROUP BY q.id, q.criteria_json;
$$;
GRANT EXECUTE ON FUNCTION public.quest_progress(uuid) TO anon, authenticated;

-- Public contributors list (opted-in)
CREATE OR REPLACE FUNCTION public.quest_public_contributors(p_quest_id uuid)
RETURNS TABLE (user_id uuid, display_name text, accepted_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT qp.user_id,
         COALESCE(NULLIF(qp.display_name, ''), 'Anonymous') AS display_name,
         COUNT(qc.id) FILTER (WHERE qc.status = 'accepted')::bigint AS accepted_count
  FROM public.quest_participations qp
  LEFT JOIN public.quest_contributions qc
    ON qc.quest_id = qp.quest_id AND qc.user_id = qp.user_id
  WHERE qp.quest_id = p_quest_id AND qp.opted_in_public = true
  GROUP BY qp.user_id, qp.display_name
  ORDER BY accepted_count DESC, display_name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.quest_public_contributors(uuid) TO anon, authenticated;

-- ── 7. Recap stub generator ──────────────────────────────────────────────
-- Called by admin when marking a quest 'completed'. Creates a draft news article
-- crediting opted-in contributors. Reuses the news pipeline (review-gate then publish).
CREATE OR REPLACE FUNCTION public.quest_create_recap_stub(p_quest_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quest public.quests%ROWTYPE;
  v_source_id uuid;
  v_article_id uuid;
  v_credits text;
  v_body text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'quest not found'; END IF;

  IF v_quest.recap_article_id IS NOT NULL THEN
    RETURN v_quest.recap_article_id;
  END IF;

  -- Reuse or create an "Editorial Quests" news source row
  SELECT id INTO v_source_id FROM public.news_sources
    WHERE name = 'Editorial Quests' LIMIT 1;
  IF v_source_id IS NULL THEN
    INSERT INTO public.news_sources (name, url, source_type, category, is_active)
    VALUES ('Editorial Quests', 'https://queer.guide/quests', 'editorial', 'general', true)
    RETURNING id INTO v_source_id;
  END IF;

  -- Build credits markdown from opted-in contributors with accepted work
  SELECT string_agg('- ' || display_name || ' (' || accepted_count || ')', E'\n')
    INTO v_credits
    FROM public.quest_public_contributors(p_quest_id)
    WHERE accepted_count > 0;

  v_body := E'# ' || v_quest.title || E'\n\n' ||
            COALESCE(v_quest.brief_md, '') || E'\n\n' ||
            E'## Contributors\n\n' || COALESCE(v_credits, '_No public contributors yet._') ||
            E'\n\n_Auto-generated recap stub. Edit before publishing._';

  INSERT INTO public.news_articles
    (source_id, title, content, excerpt, url, published_at, category, slug, fingerprint, quality_status)
  VALUES
    (v_source_id,
     'Recap: ' || v_quest.title,
     v_body,
     LEFT(COALESCE(v_quest.brief_md, v_quest.title), 240),
     'https://queer.guide/quests/' || v_quest.slug,
     now(),
     'editorial',
     'quest-recap-' || v_quest.slug,
     'quest-recap-' || v_quest.id::text,
     'review')
  RETURNING id INTO v_article_id;

  UPDATE public.quests SET recap_article_id = v_article_id WHERE id = p_quest_id;
  RETURN v_article_id;
END $$;

GRANT EXECUTE ON FUNCTION public.quest_create_recap_stub(uuid) TO authenticated;
