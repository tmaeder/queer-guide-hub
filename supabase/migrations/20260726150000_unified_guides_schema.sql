-- ============================================================================
-- Unified Guides (1/4): schema.
--
-- One content family replaces three copy-pasted guide systems
-- (marketplace_guides / venue_guides / event_guides), quests, and the
-- /places editorial_rails: public.guides with format IN ('guide','list','quest')
-- plus polymorphic guide_picks (entity vocab aligned with search_documents so
-- pick hydration + safety gating ride the existing denormalized table),
-- guide_sections, guide_reads, and the quest participation module
-- (guide_participations / guide_contributions). editorial_covers and
-- editorial_drafts stay — they are entity enrichment, not documents.
--
-- Quest lifecycle is DERIVED from the publish window (published + starts/ends),
-- not a second status machine: scheduled = now<starts_at, active = in window,
-- completed = now>ends_at.
--
-- Backfill (3/4) preserves source UUIDs, so reads/participations/contributions
-- copy 1:1. Legacy tables are frozen at cutover and dropped after soak.
-- All idempotent.
-- ============================================================================

-- 1. guides ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format              TEXT NOT NULL DEFAULT 'guide'
                      CHECK (format IN ('guide','list','quest')),
  slug                TEXT NOT NULL UNIQUE
                      CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  title               TEXT NOT NULL,
  dek                 TEXT,
  intro_md            TEXT,
  hero_image_path     TEXT,
  category            TEXT,
  -- What the picks are "about" (search_documents vocab); NULL = mixed.
  -- Drives the admin entity picker default and the 45d/90d review cadence.
  primary_entity_type TEXT
                      CHECK (primary_entity_type IS NULL OR primary_entity_type IN
                        ('venue','event','marketplace','city','country','queer_village',
                         'personality','news','milestone','group','organization')),
  city_id             UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  audience_tags       TEXT[] NOT NULL DEFAULT '{}'::text[],
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','review','published','archived')),
  starts_at           TIMESTAMPTZ,
  ends_at             TIMESTAMPTZ,
  -- Quest-only: {entity_type, target_count, tags[], region, notes}
  criteria            JSONB NOT NULL DEFAULT '{}'::jsonb,
  recap_article_id    UUID REFERENCES public.news_articles(id) ON DELETE SET NULL,
  published_at        TIMESTAMPTZ,
  author_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reading_time_min    INT,
  pick_count          INT NOT NULL DEFAULT 0,
  review_due_at       TIMESTAMPTZ,
  is_featured         BOOLEAN NOT NULL DEFAULT false,
  safety_gated        BOOLEAN NOT NULL DEFAULT false,
  meta                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guides_window_chk CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT guides_quest_shape_chk CHECK (
    format = 'quest' OR (criteria = '{}'::jsonb AND recap_article_id IS NULL))
);

COMMENT ON TABLE public.guides IS
  'Unified editorial content family: guide (Wirecutter-style tiered picks), list (curated entity rail, ex editorial_rails), quest (time-bounded community challenge). Public at /guides.';
COMMENT ON COLUMN public.guides.primary_entity_type IS
  'search_documents entity vocab. What the picks are about; NULL = mixed. Event-primary guides get 45d review cadence, others 90d.';
COMMENT ON COLUMN public.guides.criteria IS
  'Quest-only. Shape: {entity_type, target_count, tags[], region, notes}.';

CREATE INDEX IF NOT EXISTS guides_status_idx
  ON public.guides (status) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS guides_published_at_idx
  ON public.guides (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS guides_format_status_idx
  ON public.guides (format, status);
CREATE INDEX IF NOT EXISTS guides_city_idx
  ON public.guides (city_id) WHERE city_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS guides_category_idx
  ON public.guides (category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS guides_primary_entity_idx
  ON public.guides (primary_entity_type) WHERE primary_entity_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS guides_audience_tags_idx
  ON public.guides USING gin (audience_tags);
CREATE INDEX IF NOT EXISTS guides_review_due_idx
  ON public.guides (review_due_at)
  WHERE status = 'published' AND review_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS guides_quest_window_idx
  ON public.guides (starts_at, ends_at)
  WHERE format = 'quest' AND status = 'published';
CREATE INDEX IF NOT EXISTS guides_safety_gated_idx
  ON public.guides (id) WHERE safety_gated;

ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guides' AND policyname='guides_public_read') THEN
    CREATE POLICY guides_public_read ON public.guides
      FOR SELECT USING (
        status = 'published'
        AND ((NOT safety_gated) OR (SELECT auth.uid()) IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guides' AND policyname='guides_admin_all') THEN
    CREATE POLICY guides_admin_all ON public.guides
      FOR ALL USING (public.has_role_jwt('admin'))
              WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;

-- 2. guide_picks (polymorphic, search_documents vocab) -----------------------

CREATE TABLE IF NOT EXISTS public.guide_picks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id      UUID NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL
                CHECK (entity_type IN
                  ('venue','event','marketplace','city','country','queer_village',
                   'personality','news','milestone','group','organization')),
  entity_id     UUID NOT NULL,
  tier          TEXT
                CHECK (tier IS NULL OR tier IN ('top','also_great','upgrade','budget','avoid')),
  rationale_md  TEXT,
  pros          TEXT[] NOT NULL DEFAULT '{}'::text[],
  cons          TEXT[] NOT NULL DEFAULT '{}'::text[],
  position      INT NOT NULL DEFAULT 0,
  -- Tombstone: target deleted or merged away. Hidden from public render,
  -- visible in admin so editors replace instead of silently losing picks.
  is_orphaned   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guide_id, entity_type, entity_id)
);

COMMENT ON TABLE public.guide_picks IS
  'Polymorphic ordered picks (tiered for format=guide, tier NULL for format=list). entity vocab = search_documents; hydration joins search_documents so gated entities self-filter for anon.';

CREATE INDEX IF NOT EXISTS guide_picks_guide_idx
  ON public.guide_picks (guide_id, tier, position);
CREATE INDEX IF NOT EXISTS guide_picks_entity_idx
  ON public.guide_picks (entity_type, entity_id);

ALTER TABLE public.guide_picks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Full parent predicate (published + safety gate), not just status —
  -- picks of a gated guide must not leak to anon.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_picks' AND policyname='guide_picks_public_read') THEN
    CREATE POLICY guide_picks_public_read ON public.guide_picks
      FOR SELECT USING (
        NOT is_orphaned
        AND EXISTS (
          SELECT 1 FROM public.guides g
          WHERE g.id = guide_id
            AND g.status = 'published'
            AND ((NOT g.safety_gated) OR (SELECT auth.uid()) IS NOT NULL)
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_picks' AND policyname='guide_picks_admin_all') THEN
    CREATE POLICY guide_picks_admin_all ON public.guide_picks
      FOR ALL USING (public.has_role_jwt('admin'))
              WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;

-- 3. guide_sections ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guide_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id    UUID NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'prose'
              CHECK (kind IN ('prose','callout','comparison')),
  body_md     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_sections_guide_idx
  ON public.guide_sections (guide_id, position);

ALTER TABLE public.guide_sections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_sections' AND policyname='guide_sections_public_read') THEN
    CREATE POLICY guide_sections_public_read ON public.guide_sections
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.guides g
          WHERE g.id = guide_id
            AND g.status = 'published'
            AND ((NOT g.safety_gated) OR (SELECT auth.uid()) IS NOT NULL)
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_sections' AND policyname='guide_sections_admin_all') THEN
    CREATE POLICY guide_sections_admin_all ON public.guide_sections
      FOR ALL USING (public.has_role_jwt('admin'))
              WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;

-- 4. guide_reads (per-user reading state; merged streak across all formats) --

CREATE TABLE IF NOT EXISTS public.guide_reads (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guide_id      UUID NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  scroll_pct    INT NOT NULL DEFAULT 0 CHECK (scroll_pct BETWEEN 0 AND 100),
  PRIMARY KEY (user_id, guide_id)
);

CREATE INDEX IF NOT EXISTS guide_reads_user_completed_idx
  ON public.guide_reads (user_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS guide_reads_user_inprogress_idx
  ON public.guide_reads (user_id, started_at DESC)
  WHERE completed_at IS NULL;

ALTER TABLE public.guide_reads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Owner-only. No admin policy — admins read aggregates, not individuals.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_reads' AND policyname='guide_reads_owner_select') THEN
    CREATE POLICY guide_reads_owner_select ON public.guide_reads
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_reads' AND policyname='guide_reads_owner_insert') THEN
    CREATE POLICY guide_reads_owner_insert ON public.guide_reads
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_reads' AND policyname='guide_reads_owner_update') THEN
    CREATE POLICY guide_reads_owner_update ON public.guide_reads
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_reads' AND policyname='guide_reads_owner_delete') THEN
    CREATE POLICY guide_reads_owner_delete ON public.guide_reads
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Participation module (quest-only by trigger guard) ----------------------

CREATE TABLE IF NOT EXISTS public.guide_participations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guide_id         UUID NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  opted_in_public  BOOLEAN NOT NULL DEFAULT false,
  display_name     TEXT,
  progress_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  UNIQUE (user_id, guide_id)
);

CREATE INDEX IF NOT EXISTS guide_participations_guide_idx ON public.guide_participations(guide_id);
CREATE INDEX IF NOT EXISTS guide_participations_user_idx  ON public.guide_participations(user_id);

CREATE OR REPLACE FUNCTION public.tg_guide_participations_quest_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.guides WHERE id = NEW.guide_id AND format = 'quest') THEN
    RAISE EXCEPTION 'participation requires a quest-format guide';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guide_participations_quest_only ON public.guide_participations;
CREATE TRIGGER guide_participations_quest_only
  BEFORE INSERT ON public.guide_participations
  FOR EACH ROW EXECUTE FUNCTION public.tg_guide_participations_quest_only();

ALTER TABLE public.guide_participations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_participations' AND policyname='guide_participations_read_own') THEN
    CREATE POLICY guide_participations_read_own ON public.guide_participations
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_participations' AND policyname='guide_participations_read_public') THEN
    CREATE POLICY guide_participations_read_public ON public.guide_participations
      FOR SELECT TO anon, authenticated USING (opted_in_public = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_participations' AND policyname='guide_participations_insert_own') THEN
    CREATE POLICY guide_participations_insert_own ON public.guide_participations
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_participations' AND policyname='guide_participations_update_own') THEN
    CREATE POLICY guide_participations_update_own ON public.guide_participations
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_participations' AND policyname='guide_participations_delete_own') THEN
    CREATE POLICY guide_participations_delete_own ON public.guide_participations
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.guide_contributions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id       UUID NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submission_id  UUID REFERENCES public.community_submissions(id) ON DELETE SET NULL,
  -- Promoted entity, search_documents vocab (quest_contributions stored raw
  -- table names like 'venues'; backfill normalizes).
  entity_type    TEXT,
  entity_id      UUID,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','rejected')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guide_contributions_link_chk CHECK (submission_id IS NOT NULL OR entity_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS guide_contributions_guide_idx      ON public.guide_contributions(guide_id);
CREATE INDEX IF NOT EXISTS guide_contributions_user_idx       ON public.guide_contributions(user_id);
CREATE INDEX IF NOT EXISTS guide_contributions_submission_idx ON public.guide_contributions(submission_id);

ALTER TABLE public.guide_contributions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Tightened vs the old quest_contributions USING(true): public sees only
  -- accepted contributions from opted-in participants (the old policy leaked
  -- user_id of non-opted-in users). Aggregate counts go through the
  -- SECURITY DEFINER quest_progress() RPC.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_contributions' AND policyname='guide_contributions_read_own') THEN
    CREATE POLICY guide_contributions_read_own ON public.guide_contributions
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_contributions' AND policyname='guide_contributions_read_public') THEN
    CREATE POLICY guide_contributions_read_public ON public.guide_contributions
      FOR SELECT TO anon, authenticated USING (
        status = 'accepted'
        AND EXISTS (
          SELECT 1 FROM public.guide_participations p
          WHERE p.guide_id = guide_contributions.guide_id
            AND p.user_id = guide_contributions.user_id
            AND p.opted_in_public = true
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_contributions' AND policyname='guide_contributions_admin_write') THEN
    CREATE POLICY guide_contributions_admin_write ON public.guide_contributions
      FOR ALL TO authenticated
      USING (public.has_role_jwt('admin'))
      WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;

-- 6. guide_slug_redirects (route consolidation + backfill collisions + merges)

CREATE TABLE IF NOT EXISTS public.guide_slug_redirects (
  old_slug    TEXT PRIMARY KEY,
  guide_id    UUID NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guide_slug_redirects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guide_slug_redirects' AND policyname='guide_slug_redirects_public_read') THEN
    CREATE POLICY guide_slug_redirects_public_read ON public.guide_slug_redirects
      FOR SELECT USING (true);
  END IF;
END $$;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.guide_slug_redirects FROM anon, authenticated;

-- 7. community_submissions.guide_id (successor of quest_id; old column stays
--    until the drop-legacy migration after soak) --------------------------------

ALTER TABLE public.community_submissions
  ADD COLUMN IF NOT EXISTS guide_id UUID REFERENCES public.guides(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS community_submissions_guide_idx
  ON public.community_submissions(guide_id) WHERE guide_id IS NOT NULL;

-- 8. Triggers on guides ------------------------------------------------------

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='set_updated_at' AND pronamespace='public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS guides_set_updated_at ON public.guides;
    CREATE TRIGGER guides_set_updated_at
      BEFORE UPDATE ON public.guides
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS guide_picks_set_updated_at ON public.guide_picks;
    CREATE TRIGGER guide_picks_set_updated_at
      BEFORE UPDATE ON public.guide_picks
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS guide_sections_set_updated_at ON public.guide_sections;
    CREATE TRIGGER guide_sections_set_updated_at
      BEFORE UPDATE ON public.guide_sections
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Publish defaults: stamp published_at, default review cadence 45d for
-- event-primary guides (events go stale fast), 90d otherwise.
CREATE OR REPLACE FUNCTION public.guides_publish_defaults()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    IF NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
    IF NEW.review_due_at IS NULL THEN
      NEW.review_due_at := NEW.published_at
        + CASE WHEN NEW.primary_entity_type = 'event'
               THEN INTERVAL '45 days' ELSE INTERVAL '90 days' END;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guides_publish_defaults ON public.guides;
CREATE TRIGGER guides_publish_defaults
  BEFORE UPDATE ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.guides_publish_defaults();

-- Safety gate from city → country criminalization. guides has no country_id,
-- so the shared set_entity_safety_gated() (reads NEW.country_id) can't be
-- reused; location_is_high_risk resolves country via the city.
CREATE OR REPLACE FUNCTION public.set_guide_safety_gated()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.safety_gated := public.location_is_high_risk(NULL, NEW.city_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guides_safety_gated ON public.guides;
CREATE TRIGGER trg_guides_safety_gated
  BEFORE INSERT OR UPDATE OF city_id ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.set_guide_safety_gated();

-- 9. pick_count: statement-level refresh (transition tables). The legacy
-- row-level version issued one guides UPDATE per pick row — a storm amplifier
-- during bulk authoring/backfill. Counts non-orphaned picks only.
CREATE OR REPLACE FUNCTION public.guides_refresh_pick_count_stmt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_guide_ids UUID[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT guide_id) INTO v_guide_ids FROM new_picks;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT guide_id) INTO v_guide_ids FROM old_picks;
  ELSE
    SELECT array_agg(DISTINCT guide_id) INTO v_guide_ids
      FROM (SELECT guide_id FROM new_picks UNION SELECT guide_id FROM old_picks) u;
  END IF;

  IF v_guide_ids IS NULL THEN RETURN NULL; END IF;

  UPDATE public.guides g
     SET pick_count = (
           SELECT COUNT(*) FROM public.guide_picks p
            WHERE p.guide_id = g.id AND NOT p.is_orphaned
         )
   WHERE g.id = ANY(v_guide_ids);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS guide_picks_count_ins ON public.guide_picks;
CREATE TRIGGER guide_picks_count_ins
  AFTER INSERT ON public.guide_picks
  REFERENCING NEW TABLE AS new_picks
  FOR EACH STATEMENT EXECUTE FUNCTION public.guides_refresh_pick_count_stmt();

DROP TRIGGER IF EXISTS guide_picks_count_upd ON public.guide_picks;
CREATE TRIGGER guide_picks_count_upd
  AFTER UPDATE OF guide_id, is_orphaned ON public.guide_picks
  REFERENCING OLD TABLE AS old_picks NEW TABLE AS new_picks
  FOR EACH STATEMENT EXECUTE FUNCTION public.guides_refresh_pick_count_stmt();

DROP TRIGGER IF EXISTS guide_picks_count_del ON public.guide_picks;
CREATE TRIGGER guide_picks_count_del
  AFTER DELETE ON public.guide_picks
  REFERENCING OLD TABLE AS old_picks
  FOR EACH STATEMENT EXECUTE FUNCTION public.guides_refresh_pick_count_stmt();
