-- ============================================================================
-- Marketplace Editorial Atlas — Phase 0 foundations.
--
-- Adds the 4 guide tables (guides, picks, sections, reads) that the
-- Wirecutter-style guide-first marketplace rides on top of the existing
-- marketplace_listings pipeline. See docs/plans/2026-05-24-marketplace-redesign.md §2.
-- marketplace_collections already exists from #1141 with a richer schema and
-- a normalized marketplace_collection_items junction; §5 will extend that
-- instead of duplicating it.
--
-- No user-visible change yet — tables stay empty until Phase 2 (admin
-- authoring) and Phase 5 (collections) ship.
--
-- All idempotent. Public read for published rows. Admin write via
-- public.has_role_jwt('admin') (JWT-based; the legacy has_role(uid,role)
-- is deprecated per baseline migration comment).
-- ============================================================================

-- 1. marketplace_guides ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketplace_guides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  dek               TEXT,
  intro_md          TEXT,
  hero_image_path   TEXT,
  category_slug     TEXT,
  city_id           UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  audience_tags     TEXT[] NOT NULL DEFAULT '{}'::text[],
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','review','published','archived')),
  published_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reading_time_min  INT,
  pick_count        INT NOT NULL DEFAULT 0,
  review_due_at     TIMESTAMPTZ,
  is_featured       BOOLEAN NOT NULL DEFAULT false,
  meta              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS marketplace_guides_status_idx
  ON public.marketplace_guides (status) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS marketplace_guides_published_at_idx
  ON public.marketplace_guides (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS marketplace_guides_city_idx
  ON public.marketplace_guides (city_id) WHERE city_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_guides_category_idx
  ON public.marketplace_guides (category_slug) WHERE category_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_guides_audience_tags_idx
  ON public.marketplace_guides USING gin (audience_tags);
CREATE INDEX IF NOT EXISTS marketplace_guides_review_due_idx
  ON public.marketplace_guides (review_due_at)
  WHERE status = 'published' AND review_due_at IS NOT NULL;

ALTER TABLE public.marketplace_guides ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guides' AND policyname='marketplace_guides_select_published') THEN
    CREATE POLICY marketplace_guides_select_published ON public.marketplace_guides
      FOR SELECT USING (status = 'published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guides' AND policyname='marketplace_guides_admin_all') THEN
    CREATE POLICY marketplace_guides_admin_all ON public.marketplace_guides
      FOR ALL USING (public.has_role_jwt('admin'))
              WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;

-- 2. marketplace_guide_picks -------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketplace_guide_picks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id      UUID NOT NULL REFERENCES public.marketplace_guides(id) ON DELETE CASCADE,
  listing_id    UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  tier          TEXT NOT NULL
                CHECK (tier IN ('top','also_great','upgrade','budget','avoid')),
  rationale_md  TEXT,
  pros          TEXT[] NOT NULL DEFAULT '{}'::text[],
  cons          TEXT[] NOT NULL DEFAULT '{}'::text[],
  position      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guide_id, listing_id)
);

CREATE INDEX IF NOT EXISTS marketplace_guide_picks_guide_idx
  ON public.marketplace_guide_picks (guide_id, tier, position);
CREATE INDEX IF NOT EXISTS marketplace_guide_picks_listing_idx
  ON public.marketplace_guide_picks (listing_id);

ALTER TABLE public.marketplace_guide_picks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Read picks only for published guides. Subquery is fine here — the
  -- guides RLS does the heavy filtering, and pick reads are always
  -- nested under a guide fetch in practice.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guide_picks' AND policyname='marketplace_guide_picks_select_published') THEN
    CREATE POLICY marketplace_guide_picks_select_published ON public.marketplace_guide_picks
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.marketplace_guides g
          WHERE g.id = guide_id AND g.status = 'published'
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guide_picks' AND policyname='marketplace_guide_picks_admin_all') THEN
    CREATE POLICY marketplace_guide_picks_admin_all ON public.marketplace_guide_picks
      FOR ALL USING (public.has_role_jwt('admin'))
              WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;

-- Keep pick_count denormalized on guides so card rendering doesn't need a join.
CREATE OR REPLACE FUNCTION public.marketplace_guides_refresh_pick_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.marketplace_guides g
     SET pick_count = (
           SELECT COUNT(*) FROM public.marketplace_guide_picks p
            WHERE p.guide_id = g.id
         ),
         updated_at = now()
   WHERE g.id = COALESCE(NEW.guide_id, OLD.guide_id);
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS marketplace_guide_picks_count_trigger
  ON public.marketplace_guide_picks;
CREATE TRIGGER marketplace_guide_picks_count_trigger
  AFTER INSERT OR DELETE ON public.marketplace_guide_picks
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_guides_refresh_pick_count();

-- 3. marketplace_guide_sections ---------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketplace_guide_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id    UUID NOT NULL REFERENCES public.marketplace_guides(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'prose'
              CHECK (kind IN ('prose','callout','comparison')),
  body_md     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_guide_sections_guide_idx
  ON public.marketplace_guide_sections (guide_id, position);

ALTER TABLE public.marketplace_guide_sections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guide_sections' AND policyname='marketplace_guide_sections_select_published') THEN
    CREATE POLICY marketplace_guide_sections_select_published ON public.marketplace_guide_sections
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.marketplace_guides g
          WHERE g.id = guide_id AND g.status = 'published'
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guide_sections' AND policyname='marketplace_guide_sections_admin_all') THEN
    CREATE POLICY marketplace_guide_sections_admin_all ON public.marketplace_guide_sections
      FOR ALL USING (public.has_role_jwt('admin'))
              WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;

-- 4. marketplace_guide_reads (per-user, gamification + personalization) -----

CREATE TABLE IF NOT EXISTS public.marketplace_guide_reads (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guide_id      UUID NOT NULL REFERENCES public.marketplace_guides(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  scroll_pct    INT NOT NULL DEFAULT 0 CHECK (scroll_pct BETWEEN 0 AND 100),
  PRIMARY KEY (user_id, guide_id)
);

CREATE INDEX IF NOT EXISTS marketplace_guide_reads_user_completed_idx
  ON public.marketplace_guide_reads (user_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_guide_reads_user_inprogress_idx
  ON public.marketplace_guide_reads (user_id, started_at DESC)
  WHERE completed_at IS NULL;

ALTER TABLE public.marketplace_guide_reads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Owner-only read/write. No admin policy — admins read aggregates,
  -- not individual users' reading state.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guide_reads' AND policyname='marketplace_guide_reads_owner_select') THEN
    CREATE POLICY marketplace_guide_reads_owner_select ON public.marketplace_guide_reads
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guide_reads' AND policyname='marketplace_guide_reads_owner_insert') THEN
    CREATE POLICY marketplace_guide_reads_owner_insert ON public.marketplace_guide_reads
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guide_reads' AND policyname='marketplace_guide_reads_owner_update') THEN
    CREATE POLICY marketplace_guide_reads_owner_update ON public.marketplace_guide_reads
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_guide_reads' AND policyname='marketplace_guide_reads_owner_delete') THEN
    CREATE POLICY marketplace_guide_reads_owner_delete ON public.marketplace_guide_reads
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. (skipped) marketplace_collections — already exists with a richer v2
-- schema (marketplace_collections + marketplace_collection_items junction,
-- shipped in #1141). The §5 Local Supporter / collection-progress feature
-- will extend that schema in Phase 5 instead of duplicating it.

-- 6. updated_at triggers (reuse existing helper if present) -----------------

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='set_updated_at' AND pronamespace='public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS marketplace_guides_set_updated_at ON public.marketplace_guides;
    CREATE TRIGGER marketplace_guides_set_updated_at
      BEFORE UPDATE ON public.marketplace_guides
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS marketplace_guide_picks_set_updated_at ON public.marketplace_guide_picks;
    CREATE TRIGGER marketplace_guide_picks_set_updated_at
      BEFORE UPDATE ON public.marketplace_guide_picks
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS marketplace_guide_sections_set_updated_at ON public.marketplace_guide_sections;
    CREATE TRIGGER marketplace_guide_sections_set_updated_at
      BEFORE UPDATE ON public.marketplace_guide_sections
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 7. Auto-default review_due_at on publish (90 days) ------------------------

CREATE OR REPLACE FUNCTION public.marketplace_guides_default_review_due()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    IF NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
    IF NEW.review_due_at IS NULL THEN
      NEW.review_due_at := NEW.published_at + INTERVAL '90 days';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS marketplace_guides_publish_defaults
  ON public.marketplace_guides;
CREATE TRIGGER marketplace_guides_publish_defaults
  BEFORE UPDATE ON public.marketplace_guides
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_guides_default_review_due();

COMMENT ON TABLE public.marketplace_guides IS
  'Wirecutter-style editorial guides surfaced on /marketplace and /marketplace/guides. See docs/plans/2026-05-24-marketplace-redesign.md.';
COMMENT ON TABLE public.marketplace_guide_picks IS
  'Tiered picks (top/also_great/upgrade/budget/avoid) referencing marketplace_listings, with per-pick rationale + pros/cons.';
COMMENT ON TABLE public.marketplace_guide_sections IS
  'Optional long-form prose/callout/comparison sections interleaved with picks.';
COMMENT ON TABLE public.marketplace_guide_reads IS
  'Per-user reading state for guides — gamification (streaks), personalization (continue reading), no admin visibility into individuals.';
COMMENT ON TABLE public.marketplace_collections IS
  'Editor-defined discovery sets (e.g. "Berlin queer-owned coffee") used for collection-progress gamification.';
