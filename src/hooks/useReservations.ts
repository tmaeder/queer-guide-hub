/**
 * Unified reservations layer.
 *
 * Phase 1 (this file) reads from BOTH legacy tables — `bookings` (external
 * provider records, has user_id) and `trip_reservations` (manual trip items,
 * scoped via trip_id) — and projects them into one `Reservation` shape so the
 * UI can stop caring about the split.
 *
 * Phase 2 (follow-up PR) will introduce a real `reservations` table, dual-
 * write, then cut over. The hook signature stays stable across that change.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type ReservationType =
  | 'flight'
  | 'hotel'
  | 'activity'
  | 'transit'
  | 'restaurant'
  | 'event'
  | 'other';

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'failed';

export type ReservationSource =
  | 'manual'
  | 'imported_email'
  | 'provider_api'
  | 'scraper';

export interface Reservation {
  /** Stable composite id: `${origin}:${row.id}` so UI keys never collide */
  key: string;
  /** Underlying row id (booking.id or trip_reservation.id) */
  id: string;
  /** Which legacy table this came from. Removed once the unified table lands. */
  origin: 'booking' | 'trip_reservation';
  source: ReservationSource;

  user_id: string | null;
  trip_id: string | null;
  trip_title?: string | null;

  type: ReservationType;
  title: string;
  status: ReservationStatus;

  start_at: string | null;
  end_at: string | null;

  provider: string | null;
  provider_booking_id: string | null;
  confirmation_code: string | null;
  booking_url: string | null;

  total_amount: number | null;
  currency: string | null;

  city_id: string | null;
  country_id: string | null;

  notes: string | null;
  created_at: string;
}

const RESERVATION_QUERY_KEY = (userId: string | undefined) => ['reservations', userId] as const;

const normalizeBookingType = (t: string | null | undefined): ReservationType => {
  switch (t) {
    case 'hotel':
    case 'flight':
    case 'activity':
    case 'restaurant':
    case 'event':
    case 'transit':
      return t;
    default:
      return 'other';
  }
};

const normalizeStatus = (s: string | null | undefined): ReservationStatus => {
  switch (s) {
    case 'confirmed':
    case 'cancelled':
    case 'completed':
    case 'failed':
    case 'pending':
      return s;
    default:
      return 'pending';
  }
};

interface BookingRow {
  id: string;
  user_id: string;
  trip_id: string | null;
  provider: string;
  provider_booking_id: string | null;
  booking_type: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  guest_name: string | null;
  total_amount: number | null;
  currency: string | null;
  city_id: string | null;
  country_id: string | null;
  created_at: string;
  trips?: { title: string | null } | null;
}

interface TripReservationRow {
  id: string;
  trip_id: string;
  type: string;
  title: string;
  confirmation_code: string | null;
  check_in: string | null;
  check_out: string | null;
  provider: string | null;
  booking_url: string | null;
  amount: number | null;
  currency: string | null;
  notes: string | null;
  status: string;
  provider_booking_id: string | null;
  auto_created: boolean | null;
  booking_id: string | null;
  created_at: string;
  trips?: { title: string | null; owner_id: string } | null;
}

const projectBooking = (b: BookingRow): Reservation => ({
  key: `booking:${b.id}`,
  id: b.id,
  origin: 'booking',
  source: 'provider_api',
  user_id: b.user_id,
  trip_id: b.trip_id,
  trip_title: b.trips?.title ?? null,
  type: normalizeBookingType(b.booking_type),
  title: b.guest_name || `${b.booking_type} booking`,
  status: normalizeStatus(b.status),
  start_at: b.check_in,
  end_at: b.check_out,
  provider: b.provider,
  provider_booking_id: b.provider_booking_id,
  confirmation_code: null,
  booking_url: null,
  total_amount: b.total_amount,
  currency: b.currency,
  city_id: b.city_id,
  country_id: b.country_id,
  notes: null,
  created_at: b.created_at,
});

const projectTripReservation = (r: TripReservationRow, userId: string): Reservation => ({
  key: `trip_reservation:${r.id}`,
  id: r.id,
  origin: 'trip_reservation',
  source: r.auto_created ? 'imported_email' : 'manual',
  user_id: r.trips?.owner_id ?? userId,
  trip_id: r.trip_id,
  trip_title: r.trips?.title ?? null,
  type: normalizeBookingType(r.type),
  title: r.title,
  status: normalizeStatus(r.status),
  start_at: r.check_in,
  end_at: r.check_out,
  provider: r.provider,
  provider_booking_id: r.provider_booking_id,
  confirmation_code: r.confirmation_code,
  booking_url: r.booking_url,
  total_amount: r.amount,
  currency: r.currency,
  city_id: null,
  country_id: null,
  notes: r.notes,
  created_at: r.created_at,
});

/**
 * Returns every reservation visible to the current user — bookings they own
 * plus reservation rows on trips they own. Sorted by start date ascending,
 * undated last.
 */
export function useReservations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: RESERVATION_QUERY_KEY(user?.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Reservation[]> => {
      if (!user) return [];

      const [bookingsRes, tripResRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('*, trips(title)')
          .eq('user_id', user.id),
        supabase
          .from('trip_reservations')
          .select('*, trips!inner(title, owner_id)')
          .eq('trips.owner_id', user.id),
      ]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (tripResRes.error) throw tripResRes.error;

      const projected: Reservation[] = [
        ...(bookingsRes.data ?? []).map((b) => projectBooking(b as unknown as BookingRow)),
        ...(tripResRes.data ?? []).map((r) =>
          projectTripReservation(r as unknown as TripReservationRow, user.id),
        ),
      ];

      projected.sort((a, b) => {
        const ax = a.start_at ?? '';
        const bx = b.start_at ?? '';
        if (!ax && !bx) return b.created_at.localeCompare(a.created_at);
        if (!ax) return 1;
        if (!bx) return -1;
        return ax.localeCompare(bx);
      });

      return projected;
    },
  });
}

/** Just the unattached bookings — these power the Inbox. */
export function useOrphanReservations() {
  const query = useReservations();
  return {
    ...query,
    data: (query.data ?? []).filter((r) => !r.trip_id),
  };
}

/**
 * Attach an external booking row to a trip. Only valid for `origin === 'booking'`.
 * For trip_reservation rows the trip_id is immutable today (move flow lands later).
 */
export function useAttachBookingToTrip() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ bookingId, tripId }: { bookingId: string; tripId: string }) => {
      const { error } = await supabase
        .from('bookings')
        .update({ trip_id: tripId })
        .eq('id', bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RESERVATION_QUERY_KEY(user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['trips', user?.id] });
    },
  });
}

/** Detach a booking from its trip — moves it back to the Inbox. */
export function useDetachBooking() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from('bookings')
        .update({ trip_id: null })
        .eq('id', bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RESERVATION_QUERY_KEY(user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['trips', user?.id] });
    },
  });
}
