-- Cutover: drop legacy `bookings` and `trip_reservations` tables.
--
-- All app writers now target the unified `reservations` table directly:
--   * useTripReservations / useReservationMutations  → `reservations`
--   * useReservations attach/detach                 → `reservations.trip_id`
--   * HotelBookingFlow                              → `reservations`
--   * TripBookingAssistant (read)                   → `reservations`
--
-- The dual-write triggers introduced in 20260417170000_reservations_dual_write
-- are no longer needed and would error against dropped tables. Drop them
-- first, then the trigger functions, then the legacy_*_id columns on
-- `reservations` (FK references), then the tables themselves.

-- 1. Drop dual-write triggers.
DROP TRIGGER IF EXISTS bookings_sync_to_reservations ON public.bookings;
DROP TRIGGER IF EXISTS trip_reservations_sync_to_reservations ON public.trip_reservations;
DROP FUNCTION IF EXISTS public.sync_booking_to_reservation();
DROP FUNCTION IF EXISTS public.sync_trip_reservation_to_reservation();

-- 2. Drop reservations columns referencing legacy tables.
ALTER TABLE public.reservations DROP COLUMN IF EXISTS legacy_booking_id;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS legacy_trip_reservation_id;

-- 3. Drop legacy tables. CASCADE handles dependent objects (e.g.
--    booking_webhooks.booking_id FK to bookings).
DROP TABLE IF EXISTS public.booking_webhooks CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.trip_reservations CASCADE;
