-- ============================================================
-- Trip Planning V2: Suggestion impression tracking
--
-- Records every time a reservation or packing suggestion card
-- is rendered in view (via IntersectionObserver, debounced
-- 500ms). Used for conversion-funnel analysis alongside
-- trip_booking_clicks.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trip_suggestion_impressions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL
                  CHECK (suggestion_type IN (
                    'accommodation','flight','rail','bus','packing_product'
                  )),
  partner_id      UUID REFERENCES public.affiliate_partners(id) ON DELETE SET NULL,
  listing_id      UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  external_url    TEXT,
  rank_position   INT,
  shown_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_suggestion_impressions_trip
  ON public.trip_suggestion_impressions(trip_id, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_suggestion_impressions_user_day
  ON public.trip_suggestion_impressions(user_id, (date_trunc('day', shown_at)));

CREATE INDEX IF NOT EXISTS idx_trip_suggestion_impressions_partner
  ON public.trip_suggestion_impressions(partner_id, shown_at DESC)
  WHERE partner_id IS NOT NULL;

ALTER TABLE public.trip_suggestion_impressions ENABLE ROW LEVEL SECURITY;

-- Owner inserts only their own impressions
CREATE POLICY trip_suggestion_impressions_own_insert
  ON public.trip_suggestion_impressions
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Owner reads their own impressions
CREATE POLICY trip_suggestion_impressions_own_select
  ON public.trip_suggestion_impressions
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- Admins can read everything for funnel analysis
CREATE POLICY trip_suggestion_impressions_admin_select
  ON public.trip_suggestion_impressions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'admin'
    )
  );

COMMENT ON TABLE public.trip_suggestion_impressions IS
  'Fires once per suggestion card that enters viewport (IntersectionObserver, 500ms debounce). Paired with trip_booking_clicks for CTR / conversion funnel analysis.';
