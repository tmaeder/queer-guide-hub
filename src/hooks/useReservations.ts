/**
 * Unified reservations layer.
 *
 * Now reads from the unified `reservations` table (migration
 * 20260417160000_reservations_unified), which is kept in sync with the
 * legacy `bookings` and `trip_reservations` tables by the dual-write
 * triggers in 20260417170000_reservations_dual_write.
 *
 * Writes still target the legacy tables — they are the source of truth
 * during the parity window. Triggers mirror legacy writes into
 * `reservations`. Once the parity window closes, the follow-up PR will
 * flip writes over and drop the legacy tables.
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
  /** Stable composite id used as a React key. */
  key: string;
  /** Underlying `reservations.id`. */
  id: string;
  /**
   * Which legacy table this row originated from, derived from `source`.
   * Kept for backward compatibility with Inbox / planner consumers —
   * will be removed once the legacy tables are dropped.
   */
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

  /**
   * Legacy row FKs. Mutations that mutate the legacy source of truth
   * (e.g. attach/detach writes `bookings.trip_id`) use these.
   */
  legacy_booking_id: string | null;
  legacy_trip_reservation_id: string | null;
}

const RESERVATION_QUERY_KEY = (userId: string | undefined) =>
  ['reservations', userId] as const;

const normalizeType = (t: string | null | undefined): ReservationType => {
  switch (t) {
    case 'flight':
    case 'hotel':
    case 'activity':
    case 'transit':
    case 'restaurant':
    case 'event':
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

const normalizeSource = (s: string | null | undefined): ReservationSource => {
  switch (s) {
    case 'manual':
    case 'imported_email':
    case 'provider_api':
    case 'scraper':
      return s;
    default:
      return 'manual';
  }
};

interface ReservationRow {
  id: string;
  user_id: string;
  trip_id: string | null;
  trip_day_id: string | null;
  source: string;
  legacy_booking_id: string | null;
  legacy_trip_reservation_id: string | null;
  type: string;
  title: string;
  status: string;
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
  trips?: { title: string | null } | null;
}

const project = (r: ReservationRow): Reservation => {
  const source = normalizeSource(r.source);
  return {
    key: `res:${r.id}`,
    id: r.id,
    origin: source === 'provider_api' ? 'booking' : 'trip_reservation',
    source,
    user_id: r.user_id,
    trip_id: r.trip_id,
    trip_title: r.trips?.title ?? null,
    type: normalizeType(r.type),
    title: r.title,
    status: normalizeStatus(r.status),
    start_at: r.start_at,
    end_at: r.end_at,
    provider: r.provider,
    provider_booking_id: r.provider_booking_id,
    confirmation_code: r.confirmation_code,
    booking_url: r.booking_url,
    total_amount: r.total_amount,
    currency: r.currency,
    city_id: r.city_id,
    country_id: r.country_id,
    notes: r.notes,
    created_at: r.created_at,
    legacy_booking_id: r.legacy_booking_id,
    legacy_trip_reservation_id: r.legacy_trip_reservation_id,
  };
};

/**
 * Returns every reservation the current user can see: rows they own plus
 * rows on trips they co-own (RLS enforces this server-side). Sorted by
 * start date ascending, undated last.
 */
export function useReservations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: RESERVATION_QUERY_KEY(user?.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Reservation[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('reservations')
        .select('*, trips(title)');

      if (error) throw error;

      const projected = (data ?? []).map((row) =>
        project(row as unknown as ReservationRow),
      );

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

/** Just the unattached reservations — these power the Inbox. */
export function useOrphanReservations() {
  const query = useReservations();
  return {
    ...query,
    data: (query.data ?? []).filter((r) => !r.trip_id),
  };
}

/**
 * Attach an external booking row to a trip.
 *
 * Writes to the legacy `bookings` table — the source of truth during the
 * dual-write parity window. The trigger mirrors the change into
 * `reservations`, which is what every reader consumes.
 *
 * Only valid when `origin === 'booking'` (i.e. the row has a
 * `legacy_booking_id`). Moving a manual `trip_reservation` between trips
 * is a separate future flow.
 */
export function useAttachBookingToTrip() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      legacyBookingId,
      tripId,
    }: {
      legacyBookingId: string;
      tripId: string;
    }) => {
      const { error } = await supabase
        .from('bookings')
        .update({ trip_id: tripId })
        .eq('id', legacyBookingId);
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
    mutationFn: async (legacyBookingId: string) => {
      const { error } = await supabase
        .from('bookings')
        .update({ trip_id: null })
        .eq('id', legacyBookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RESERVATION_QUERY_KEY(user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['trips', user?.id] });
    },
  });
}
