-- Venue Editorial Guides — Phase 0 foundations.
-- Mirrors marketplace_guides shape; FK to venues. Public read for published rows.
-- Applies the same patterns as the marketplace editorial atlas
-- (docs/plans/2026-05-24-marketplace-redesign.md) to /venues.

CREATE TABLE IF NOT EXISTS public.venue_guides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  dek               TEXT,
  intro_md          TEXT,
  hero_image_path   TEXT,
  category          TEXT,                                  -- mirrors venues.category
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
CREATE INDEX IF NOT EXISTS venue_guides_status_idx ON public.venue_guides (status) WHERE status='published';
CREATE INDEX IF NOT EXISTS venue_guides_published_at_idx ON public.venue_guides (published_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS venue_guides_city_idx ON public.venue_guides (city_id) WHERE city_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS venue_guides_category_idx ON public.venue_guides (category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS venue_guides_audience_tags_idx ON public.venue_guides USING gin (audience_tags);
CREATE INDEX IF NOT EXISTS venue_guides_review_due_idx ON public.venue_guides (review_due_at) WHERE status='published' AND review_due_at IS NOT NULL;
ALTER TABLE public.venue_guides ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guides' AND policyname='venue_guides_select_published') THEN
    CREATE POLICY venue_guides_select_published ON public.venue_guides FOR SELECT USING (status='published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guides' AND policyname='venue_guides_admin_all') THEN
    CREATE POLICY venue_guides_admin_all ON public.venue_guides FOR ALL USING (public.has_role_jwt('admin')) WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;
GRANT SELECT ON public.venue_guides TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.venue_guide_picks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id      UUID NOT NULL REFERENCES public.venue_guides(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  tier          TEXT NOT NULL CHECK (tier IN ('top','also_great','upgrade','budget','avoid')),
  rationale_md  TEXT,
  pros          TEXT[] NOT NULL DEFAULT '{}'::text[],
  cons          TEXT[] NOT NULL DEFAULT '{}'::text[],
  position      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guide_id, venue_id)
);
CREATE INDEX IF NOT EXISTS venue_guide_picks_guide_idx ON public.venue_guide_picks (guide_id, tier, position);
CREATE INDEX IF NOT EXISTS venue_guide_picks_venue_idx ON public.venue_guide_picks (venue_id);
ALTER TABLE public.venue_guide_picks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guide_picks' AND policyname='venue_guide_picks_select_published') THEN
    CREATE POLICY venue_guide_picks_select_published ON public.venue_guide_picks FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.venue_guides g WHERE g.id = guide_id AND g.status='published'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guide_picks' AND policyname='venue_guide_picks_admin_all') THEN
    CREATE POLICY venue_guide_picks_admin_all ON public.venue_guide_picks FOR ALL USING (public.has_role_jwt('admin')) WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;
GRANT SELECT ON public.venue_guide_picks TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.venue_guides_refresh_pick_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.venue_guides g
     SET pick_count = (SELECT COUNT(*) FROM public.venue_guide_picks p WHERE p.guide_id = g.id),
         updated_at = now()
   WHERE g.id = COALESCE(NEW.guide_id, OLD.guide_id);
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS venue_guide_picks_count_trigger ON public.venue_guide_picks;
CREATE TRIGGER venue_guide_picks_count_trigger AFTER INSERT OR DELETE ON public.venue_guide_picks FOR EACH ROW EXECUTE FUNCTION public.venue_guides_refresh_pick_count();

CREATE TABLE IF NOT EXISTS public.venue_guide_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id    UUID NOT NULL REFERENCES public.venue_guides(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'prose' CHECK (kind IN ('prose','callout','comparison')),
  body_md     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_guide_sections_guide_idx ON public.venue_guide_sections (guide_id, position);
ALTER TABLE public.venue_guide_sections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guide_sections' AND policyname='venue_guide_sections_select_published') THEN
    CREATE POLICY venue_guide_sections_select_published ON public.venue_guide_sections FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.venue_guides g WHERE g.id = guide_id AND g.status='published'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guide_sections' AND policyname='venue_guide_sections_admin_all') THEN
    CREATE POLICY venue_guide_sections_admin_all ON public.venue_guide_sections FOR ALL USING (public.has_role_jwt('admin')) WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;
GRANT SELECT ON public.venue_guide_sections TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.venue_guide_reads (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guide_id      UUID NOT NULL REFERENCES public.venue_guides(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  scroll_pct    INT NOT NULL DEFAULT 0 CHECK (scroll_pct BETWEEN 0 AND 100),
  PRIMARY KEY (user_id, guide_id)
);
CREATE INDEX IF NOT EXISTS venue_guide_reads_user_completed_idx ON public.venue_guide_reads (user_id, completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS venue_guide_reads_user_inprogress_idx ON public.venue_guide_reads (user_id, started_at DESC) WHERE completed_at IS NULL;
ALTER TABLE public.venue_guide_reads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guide_reads' AND policyname='venue_guide_reads_owner_select') THEN
    CREATE POLICY venue_guide_reads_owner_select ON public.venue_guide_reads FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guide_reads' AND policyname='venue_guide_reads_owner_insert') THEN
    CREATE POLICY venue_guide_reads_owner_insert ON public.venue_guide_reads FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guide_reads' AND policyname='venue_guide_reads_owner_update') THEN
    CREATE POLICY venue_guide_reads_owner_update ON public.venue_guide_reads FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_guide_reads' AND policyname='venue_guide_reads_owner_delete') THEN
    CREATE POLICY venue_guide_reads_owner_delete ON public.venue_guide_reads FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_guide_reads TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='set_updated_at' AND pronamespace='public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS venue_guides_set_updated_at ON public.venue_guides;
    CREATE TRIGGER venue_guides_set_updated_at BEFORE UPDATE ON public.venue_guides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    DROP TRIGGER IF EXISTS venue_guide_picks_set_updated_at ON public.venue_guide_picks;
    CREATE TRIGGER venue_guide_picks_set_updated_at BEFORE UPDATE ON public.venue_guide_picks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    DROP TRIGGER IF EXISTS venue_guide_sections_set_updated_at ON public.venue_guide_sections;
    CREATE TRIGGER venue_guide_sections_set_updated_at BEFORE UPDATE ON public.venue_guide_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.venue_guides_default_review_due()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    IF NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
    IF NEW.review_due_at IS NULL THEN NEW.review_due_at := NEW.published_at + INTERVAL '90 days'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS venue_guides_publish_defaults ON public.venue_guides;
CREATE TRIGGER venue_guides_publish_defaults BEFORE UPDATE ON public.venue_guides FOR EACH ROW EXECUTE FUNCTION public.venue_guides_default_review_due();
