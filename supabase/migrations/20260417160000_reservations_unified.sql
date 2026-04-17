-- Unified reservations table — Wave 1 of the trips/bookings merge.
--
-- Design rationale:
--   `bookings` (external provider rows, has user_id) and `trip_reservations`
--   (manual trip items, scoped via trip_id) overlap heavily but live apart.
--   This migration introduces a single `reservations` table that both legacy
--   surfaces will project into. The legacy tables are NOT dropped here —
--   that comes in a follow-up cutover migration once dual-write has settled
--   for ~30 days.
--
-- Apply on a Supabase dev branch first. Do not apply to production until
-- the dual-write trigger pair (created in a separate migration) has been
-- live in dev long enough to validate parity.

CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner. Always set so RLS works without joining trips.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Optional trip + day attachment.
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  trip_day_id uuid REFERENCES public.trip_days(id) ON DELETE SET NULL,

  -- Where this row came from. `legacy_*` is set during backfill and lets us
  -- dedupe when both source tables get migrated.
  source text NOT NULL CHECK (source IN (
    'manual', 'imported_email', 'provider_api', 'scraper'
  )),
  legacy_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  legacy_trip_reservation_id uuid REFERENCES public.trip_reservations(id) ON DELETE SET NULL,

  -- What kind of reservation this is.
  type text NOT NULL CHECK (type IN (
    'flight', 'hotel', 'activity', 'transit', 'restaurant', 'event', 'other'
  )),
  title text NOT NULL,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'confirmed', 'cancelled', 'completed', 'failed'
  )),

  -- Times. start_at/end_at are normalized to timestamptz; legacy rows used
  -- check_in/check_out which we map directly during backfill.
  start_at timestamptz,
  end_at timestamptz,
  timezone text,

  -- Provider attribution.
  provider text,
  provider_booking_id text,
  confirmation_code text,
  booking_url text,
  cancellation_url text,

  -- Money.
  total_amount numeric,
  currency text,
  payment_status text,

  -- Geo. Bookings carry city/country today; trip_reservations only have a
  -- place_id pointer. We keep both columns nullable.
  city_id uuid REFERENCES public.cities(id),
  country_id uuid REFERENCES public.countries(id),

  -- Free-text + attachments + raw provider blob.
  notes text,
  attachment_urls text[],
  raw_provider_data jsonb DEFAULT '{}'::jsonb,
  cancellation_policy jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes mirror the access patterns of the in-app `useReservations` hook:
-- by user (inbox), by trip (planner tab), by user + start date (timeline).
CREATE INDEX IF NOT EXISTS idx_reservations_user_start
  ON public.reservations (user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_reservations_trip
  ON public.reservations (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_user_trip_null
  ON public.reservations (user_id, created_at DESC) WHERE trip_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_legacy_booking
  ON public.reservations (legacy_booking_id) WHERE legacy_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_legacy_trip_reservation
  ON public.reservations (legacy_trip_reservation_id) WHERE legacy_trip_reservation_id IS NOT NULL;

-- Soft uniqueness against the source rows so backfill is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_legacy_booking
  ON public.reservations (legacy_booking_id) WHERE legacy_booking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_legacy_trip_reservation
  ON public.reservations (legacy_trip_reservation_id) WHERE legacy_trip_reservation_id IS NOT NULL;

-- Trigger to keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.touch_reservations_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reservations_touch_updated_at ON public.reservations;
CREATE TRIGGER reservations_touch_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.touch_reservations_updated_at();

-- RLS — owner can do everything; trip co-members can read.
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservations_owner_select" ON public.reservations;
CREATE POLICY "reservations_owner_select" ON public.reservations
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      trip_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.trip_members tm
        WHERE tm.trip_id = reservations.trip_id
          AND tm.user_id = auth.uid()
          AND tm.accepted_at IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "reservations_owner_insert" ON public.reservations;
CREATE POLICY "reservations_owner_insert" ON public.reservations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reservations_owner_update" ON public.reservations;
CREATE POLICY "reservations_owner_update" ON public.reservations
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reservations_owner_delete" ON public.reservations;
CREATE POLICY "reservations_owner_delete" ON public.reservations
  FOR DELETE USING (auth.uid() = user_id);

-- Realtime so the Inbox + planner stay in sync across tabs.
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;

-- Backfill from bookings (one row per existing booking).
INSERT INTO public.reservations (
  user_id, trip_id, source, legacy_booking_id,
  type, title, status, start_at, end_at,
  provider, provider_booking_id,
  total_amount, currency,
  city_id, country_id,
  raw_provider_data, cancellation_policy,
  created_at, updated_at
)
SELECT
  b.user_id,
  b.trip_id,
  'provider_api',
  b.id,
  CASE WHEN b.booking_type IN ('flight','hotel','activity') THEN b.booking_type ELSE 'other' END,
  COALESCE(b.guest_name, b.booking_type || ' booking'),
  CASE WHEN b.status IN ('pending','confirmed','cancelled','completed','failed')
       THEN b.status ELSE 'pending' END,
  b.check_in,
  b.check_out,
  b.provider,
  b.provider_booking_id,
  b.total_amount,
  b.currency,
  b.city_id,
  b.country_id,
  b.provider_data,
  b.cancellation_policy,
  b.created_at,
  b.updated_at
FROM public.bookings b
ON CONFLICT (legacy_booking_id) DO NOTHING;

-- Backfill from trip_reservations. We need an owner — the trip's owner.
INSERT INTO public.reservations (
  user_id, trip_id, source, legacy_trip_reservation_id,
  type, title, status, start_at, end_at,
  provider, provider_booking_id, confirmation_code, booking_url, cancellation_url,
  total_amount, currency,
  notes, attachment_urls,
  created_at, updated_at
)
SELECT
  t.owner_id,
  r.trip_id,
  CASE WHEN r.auto_created THEN 'imported_email' ELSE 'manual' END,
  r.id,
  CASE WHEN r.type IN ('flight','hotel','activity','transit','restaurant','event')
       THEN r.type ELSE 'other' END,
  r.title,
  CASE WHEN r.status IN ('pending','confirmed','cancelled','completed','failed')
       THEN r.status ELSE 'pending' END,
  r.check_in,
  r.check_out,
  r.provider,
  r.provider_booking_id,
  r.confirmation_code,
  r.booking_url,
  r.cancellation_url,
  r.amount,
  r.currency,
  r.notes,
  r.attachment_urls,
  r.created_at,
  r.created_at
FROM public.trip_reservations r
JOIN public.trips t ON t.id = r.trip_id
ON CONFLICT (legacy_trip_reservation_id) DO NOTHING;
