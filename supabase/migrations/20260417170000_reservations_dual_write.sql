-- Dual-write triggers from legacy tables into `reservations`.
--
-- Purpose: keep the unified `reservations` table in sync with any writes
-- landing on `bookings` and `trip_reservations` during the 30-day parity
-- window. Readers can safely cut over to `reservations` alone once these
-- triggers are live.
--
-- Ordering:
--   1. This migration — triggers go live, every new legacy row mirrors
--      into `reservations`, every legacy update/delete propagates.
--   2. Follow-up PR — rewrite write paths in the app to write directly to
--      `reservations`, then drop these triggers and drop legacy tables.
--
-- Idempotency: all DROP IF EXISTS first.

-- ── bookings → reservations ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_booking_to_reservation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.reservations WHERE legacy_booking_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.reservations (
    user_id, trip_id, source, legacy_booking_id,
    type, title, status, start_at, end_at,
    provider, provider_booking_id,
    total_amount, currency,
    city_id, country_id,
    raw_provider_data, cancellation_policy,
    created_at, updated_at
  )
  VALUES (
    NEW.user_id,
    NEW.trip_id,
    'provider_api',
    NEW.id,
    CASE WHEN NEW.booking_type IN ('flight','hotel','activity') THEN NEW.booking_type ELSE 'other' END,
    COALESCE(NEW.guest_name, NEW.booking_type || ' booking'),
    CASE WHEN NEW.status IN ('pending','confirmed','cancelled','completed','failed') THEN NEW.status ELSE 'pending' END,
    NEW.check_in,
    NEW.check_out,
    NEW.provider,
    NEW.provider_booking_id,
    NEW.total_amount,
    NEW.currency,
    NEW.city_id,
    NEW.country_id,
    NEW.provider_data,
    NEW.cancellation_policy,
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (legacy_booking_id) DO UPDATE SET
    trip_id           = EXCLUDED.trip_id,
    type              = EXCLUDED.type,
    title             = EXCLUDED.title,
    status            = EXCLUDED.status,
    start_at          = EXCLUDED.start_at,
    end_at            = EXCLUDED.end_at,
    provider          = EXCLUDED.provider,
    provider_booking_id = EXCLUDED.provider_booking_id,
    total_amount      = EXCLUDED.total_amount,
    currency          = EXCLUDED.currency,
    city_id           = EXCLUDED.city_id,
    country_id        = EXCLUDED.country_id,
    raw_provider_data = EXCLUDED.raw_provider_data,
    cancellation_policy = EXCLUDED.cancellation_policy,
    updated_at        = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS bookings_sync_to_reservations ON public.bookings;
CREATE TRIGGER bookings_sync_to_reservations
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_to_reservation();

-- ── trip_reservations → reservations ────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_trip_reservation_to_reservation()
RETURNS trigger AS $$
DECLARE
  owner_uuid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.reservations WHERE legacy_trip_reservation_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Resolve owner via the parent trip.
  SELECT t.owner_id INTO owner_uuid
  FROM public.trips t
  WHERE t.id = NEW.trip_id;

  IF owner_uuid IS NULL THEN
    -- Trip is gone — can't satisfy NOT NULL user_id. Skip silently; the
    -- trip deletion cascade will clean up the legacy row next.
    RETURN NEW;
  END IF;

  INSERT INTO public.reservations (
    user_id, trip_id, source, legacy_trip_reservation_id,
    type, title, status, start_at, end_at,
    provider, provider_booking_id, confirmation_code, booking_url, cancellation_url,
    total_amount, currency,
    notes, attachment_urls,
    created_at, updated_at
  )
  VALUES (
    owner_uuid,
    NEW.trip_id,
    CASE WHEN NEW.auto_created THEN 'imported_email' ELSE 'manual' END,
    NEW.id,
    CASE WHEN NEW.type IN ('flight','hotel','activity','transit','restaurant','event') THEN NEW.type ELSE 'other' END,
    NEW.title,
    CASE WHEN NEW.status IN ('pending','confirmed','cancelled','completed','failed') THEN NEW.status ELSE 'pending' END,
    NEW.check_in,
    NEW.check_out,
    NEW.provider,
    NEW.provider_booking_id,
    NEW.confirmation_code,
    NEW.booking_url,
    NEW.cancellation_url,
    NEW.amount,
    NEW.currency,
    NEW.notes,
    NEW.attachment_urls,
    NEW.created_at,
    NEW.created_at
  )
  ON CONFLICT (legacy_trip_reservation_id) DO UPDATE SET
    trip_id           = EXCLUDED.trip_id,
    source            = EXCLUDED.source,
    type              = EXCLUDED.type,
    title             = EXCLUDED.title,
    status            = EXCLUDED.status,
    start_at          = EXCLUDED.start_at,
    end_at            = EXCLUDED.end_at,
    provider          = EXCLUDED.provider,
    provider_booking_id = EXCLUDED.provider_booking_id,
    confirmation_code = EXCLUDED.confirmation_code,
    booking_url       = EXCLUDED.booking_url,
    cancellation_url  = EXCLUDED.cancellation_url,
    total_amount      = EXCLUDED.total_amount,
    currency          = EXCLUDED.currency,
    notes             = EXCLUDED.notes,
    attachment_urls   = EXCLUDED.attachment_urls,
    updated_at        = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trip_reservations_sync_to_reservations ON public.trip_reservations;
CREATE TRIGGER trip_reservations_sync_to_reservations
  AFTER INSERT OR UPDATE OR DELETE ON public.trip_reservations
  FOR EACH ROW EXECUTE FUNCTION public.sync_trip_reservation_to_reservation();
