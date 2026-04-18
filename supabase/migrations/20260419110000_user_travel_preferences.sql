-- ============================================================
-- Trip Planning V2: User travel preferences
--
-- Drives personalization for reservation & packing suggestions:
--   - budget_tier → price sorting
--   - preferred_transport → which modes are shown first
--   - home_city_id → origin for transport deep-links
--   - travel_style → free-form jsonb (vegetarian, accessibility, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_travel_preferences (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_tier        TEXT CHECK (budget_tier IN ('budget','mid','luxury')),
  preferred_transport TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  home_city_id       UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  home_country_id    UUID REFERENCES public.countries(id) ON DELETE SET NULL,
  travel_style       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validate preferred_transport contains only known values
ALTER TABLE public.user_travel_preferences
  ADD CONSTRAINT user_travel_preferences_transport_valid
  CHECK (
    preferred_transport <@ ARRAY['flight','rail','bus','car']::TEXT[]
  );

ALTER TABLE public.user_travel_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_travel_preferences_own_row ON public.user_travel_preferences
  FOR ALL USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.user_travel_preferences_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_travel_preferences_touch_trg
  BEFORE UPDATE ON public.user_travel_preferences
  FOR EACH ROW EXECUTE FUNCTION public.user_travel_preferences_touch();

COMMENT ON TABLE public.user_travel_preferences IS 'Per-user travel preferences driving personalized trip suggestions.';
