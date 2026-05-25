-- Event Editorial Guides — Phase 0 foundations.
-- Mirrors venue_guides shape; FK to events. Public read for published rows.

CREATE TABLE IF NOT EXISTS public.event_guides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  dek               TEXT,
  intro_md          TEXT,
  hero_image_path   TEXT,
  event_type        TEXT,
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
CREATE INDEX IF NOT EXISTS event_guides_status_idx ON public.event_guides (status) WHERE status='published';
CREATE INDEX IF NOT EXISTS event_guides_published_at_idx ON public.event_guides (published_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS event_guides_city_idx ON public.event_guides (city_id) WHERE city_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_guides_event_type_idx ON public.event_guides (event_type) WHERE event_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_guides_audience_tags_idx ON public.event_guides USING gin (audience_tags);
ALTER TABLE public.event_guides ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_guides' AND policyname='event_guides_select_published') THEN
    CREATE POLICY event_guides_select_published ON public.event_guides FOR SELECT USING (status='published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_guides' AND policyname='event_guides_admin_all') THEN
    CREATE POLICY event_guides_admin_all ON public.event_guides FOR ALL USING (public.has_role_jwt('admin')) WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;
GRANT SELECT ON public.event_guides TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.event_guide_picks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id      UUID NOT NULL REFERENCES public.event_guides(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tier          TEXT NOT NULL CHECK (tier IN ('top','also_great','upgrade','budget','avoid')),
  rationale_md  TEXT,
  pros          TEXT[] NOT NULL DEFAULT '{}'::text[],
  cons          TEXT[] NOT NULL DEFAULT '{}'::text[],
  position      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guide_id, event_id)
);
CREATE INDEX IF NOT EXISTS event_guide_picks_guide_idx ON public.event_guide_picks (guide_id, tier, position);
CREATE INDEX IF NOT EXISTS event_guide_picks_event_idx ON public.event_guide_picks (event_id);
ALTER TABLE public.event_guide_picks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_guide_picks' AND policyname='event_guide_picks_select_published') THEN
    CREATE POLICY event_guide_picks_select_published ON public.event_guide_picks FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.event_guides g WHERE g.id = guide_id AND g.status='published'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_guide_picks' AND policyname='event_guide_picks_admin_all') THEN
    CREATE POLICY event_guide_picks_admin_all ON public.event_guide_picks FOR ALL USING (public.has_role_jwt('admin')) WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;
GRANT SELECT ON public.event_guide_picks TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.event_guides_refresh_pick_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.event_guides g
     SET pick_count = (SELECT COUNT(*) FROM public.event_guide_picks p WHERE p.guide_id = g.id),
         updated_at = now()
   WHERE g.id = COALESCE(NEW.guide_id, OLD.guide_id);
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS event_guide_picks_count_trigger ON public.event_guide_picks;
CREATE TRIGGER event_guide_picks_count_trigger AFTER INSERT OR DELETE ON public.event_guide_picks FOR EACH ROW EXECUTE FUNCTION public.event_guides_refresh_pick_count();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='set_updated_at' AND pronamespace='public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS event_guides_set_updated_at ON public.event_guides;
    CREATE TRIGGER event_guides_set_updated_at BEFORE UPDATE ON public.event_guides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    DROP TRIGGER IF EXISTS event_guide_picks_set_updated_at ON public.event_guide_picks;
    CREATE TRIGGER event_guide_picks_set_updated_at BEFORE UPDATE ON public.event_guide_picks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.event_guides_default_review_due()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    IF NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
    -- Events are time-bound: shorter default review window (45 days)
    -- since picked event dates pass quickly. Editor can override with
    -- an explicit review_due_at on publish.
    IF NEW.review_due_at IS NULL THEN NEW.review_due_at := NEW.published_at + INTERVAL '45 days'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS event_guides_publish_defaults ON public.event_guides;
CREATE TRIGGER event_guides_publish_defaults BEFORE UPDATE ON public.event_guides FOR EACH ROW EXECUTE FUNCTION public.event_guides_default_review_due();

-- Scorer: city + interest + freshness + featured - stale.
-- No category_affinity (no event_favorites table) and no continue_reading
-- (no reads table for events yet — events are short, not long-form reads).
CREATE OR REPLACE FUNCTION public.recommend_event_guides(p_user_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID, slug TEXT, title TEXT, dek TEXT, hero_image_path TEXT,
  event_type TEXT, city_id UUID, audience_tags TEXT[],
  reading_time_min INT, pick_count INT, published_at TIMESTAMPTZ,
  score NUMERIC, boost_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_home_city_id UUID; v_interests TEXT[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT utp.home_city_id INTO v_home_city_id
      FROM public.user_travel_preferences utp WHERE utp.user_id = p_user_id LIMIT 1;
    SELECT COALESCE(
             ARRAY(SELECT jsonb_array_elements_text(p.interests) FROM public.profiles p
                    WHERE p.id = p_user_id AND jsonb_typeof(p.interests) = 'array'),
             '{}'::text[]) INTO v_interests;
  ELSE
    v_interests := '{}'::text[];
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      g.id, g.slug, g.title, g.dek, g.hero_image_path, g.event_type, g.city_id,
      g.audience_tags, g.reading_time_min, g.pick_count, g.published_at,
      CASE WHEN v_home_city_id IS NOT NULL AND g.city_id = v_home_city_id THEN 1.0::numeric ELSE 0.0::numeric END AS s_city,
      CASE
        WHEN array_length(v_interests,1) IS NULL OR array_length(g.audience_tags,1) IS NULL THEN 0.0::numeric
        ELSE 0.8::numeric * (
          cardinality(ARRAY(SELECT unnest(v_interests) INTERSECT SELECT unnest(g.audience_tags)))::numeric
          / NULLIF(cardinality(ARRAY(SELECT unnest(v_interests) UNION SELECT unnest(g.audience_tags))), 0))
      END AS s_interest,
      0.4::numeric * exp(
        -GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(g.published_at, g.created_at))) / 86400.0, 0) / 60.0)::numeric AS s_fresh,
      CASE WHEN g.is_featured THEN 0.3::numeric ELSE 0.0::numeric END AS s_featured,
      CASE WHEN g.review_due_at IS NOT NULL AND g.review_due_at < now() THEN -2.0::numeric ELSE 0.0::numeric END AS s_stale
    FROM public.event_guides g
    WHERE g.status='published'
  )
  SELECT
    s.id, s.slug, s.title, s.dek, s.hero_image_path, s.event_type, s.city_id,
    s.audience_tags, s.reading_time_min, s.pick_count, s.published_at,
    (s.s_city + s.s_interest + s.s_fresh + s.s_featured + s.s_stale) AS score,
    CASE
      WHEN s.s_city >= s.s_interest AND s.s_city > 0 THEN 'home_city'
      WHEN s.s_interest > 0 THEN 'interest'
      WHEN s.s_featured > 0 THEN 'featured'
      ELSE NULL
    END::text AS boost_reason
  FROM scored s
  ORDER BY (s.s_city + s.s_interest + s.s_fresh + s.s_featured + s.s_stale) DESC,
           s.published_at DESC NULLS LAST
  LIMIT p_limit;
END $$;
GRANT EXECUTE ON FUNCTION public.recommend_event_guides(UUID, INT) TO anon, authenticated;
