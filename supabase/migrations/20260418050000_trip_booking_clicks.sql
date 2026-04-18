-- ============================================================
-- trip_booking_clicks: log when a trip member clicks an affiliate
-- bookable link from a place card (or the day-strip booking widget).
-- Drives a basic conversion funnel without polluting the global
-- analytics table (Umami) which doesn't carry user/trip context.
--
-- Insert is open to any authenticated user — RLS still requires the
-- trip be visible to them. Reads are owner/editor-only so members
-- don't see each other's click history.
-- ============================================================

CREATE TABLE public.trip_booking_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  trip_place_id UUID REFERENCES public.trip_places(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('hotel','activity','flight','restaurant','other')),
  destination_url TEXT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_booking_clicks_trip_clicked
  ON public.trip_booking_clicks(trip_id, clicked_at DESC);

ALTER TABLE public.trip_booking_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_booking_clicks_insert ON public.trip_booking_clicks FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_booking_clicks.trip_id
      AND (t.owner_id = (SELECT auth.uid())
           OR EXISTS (
             SELECT 1 FROM public.trip_members m
             WHERE m.trip_id = t.id AND m.user_id = (SELECT auth.uid())
           ))
  )
);

CREATE POLICY trip_booking_clicks_select ON public.trip_booking_clicks FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_booking_clicks.trip_id
      AND (t.owner_id = (SELECT auth.uid())
           OR EXISTS (
             SELECT 1 FROM public.trip_members m
             WHERE m.trip_id = t.id AND m.user_id = (SELECT auth.uid())
                   AND m.role IN ('owner','editor')
           ))
  )
);
