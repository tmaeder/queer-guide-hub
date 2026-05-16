-- Phase 4: booking-status flow on trip_places
-- Adds intent/booked/completed lifecycle + optional link to a reservation row.

ALTER TABLE public.trip_places
  ADD COLUMN IF NOT EXISTS booking_status text NOT NULL DEFAULT 'intent'
    CHECK (booking_status IN ('intent','booked','completed')),
  ADD COLUMN IF NOT EXISTS reservation_id uuid
    REFERENCES public.reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS trip_places_reservation_id_idx
  ON public.trip_places(reservation_id);

CREATE INDEX IF NOT EXISTS trip_places_booking_status_idx
  ON public.trip_places(booking_status);

COMMENT ON COLUMN public.trip_places.booking_status IS
  'Lifecycle: intent (tentative), booked (confirmed via reservation), completed (visited).';
COMMENT ON COLUMN public.trip_places.reservation_id IS
  'Optional link to reservations row that confirmed this place.';
