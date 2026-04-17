/**
 * Per-trip reservations hook.
 *
 * Reads/writes the unified `reservations` table directly. Used by
 * `ReservationsTab` for full CRUD on a trip's reservations and by
 * `TripBookingAssistant` for "is hotel/flight booked?" probes.
 *
 * Shape kept intentionally close to the legacy `trip_reservations`
 * row so the UI doesn't need a refactor. The mapping here is the
 * single source of truth for that interop.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';

export interface Reservation {
  id: string;
  trip_id: string;
  place_id: string | null;
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
  attachment_urls: string[] | null;
  created_at: string;
}

type ReservationRow = Pick<
  Tables<'reservations'>,
  | 'id'
  | 'trip_id'
  | 'type'
  | 'title'
  | 'confirmation_code'
  | 'start_at'
  | 'end_at'
  | 'provider'
  | 'booking_url'
  | 'total_amount'
  | 'currency'
  | 'notes'
  | 'status'
  | 'created_at'
>;

const project = (r: ReservationRow): Reservation => ({
  id: r.id,
  trip_id: r.trip_id ?? '',
  place_id: null,
  type: r.type,
  title: r.title,
  confirmation_code: r.confirmation_code,
  check_in: r.start_at,
  check_out: r.end_at,
  provider: r.provider,
  booking_url: r.booking_url,
  amount: r.total_amount == null ? null : Number(r.total_amount),
  currency: r.currency,
  notes: r.notes,
  status: r.status,
  attachment_urls: null,
  created_at: r.created_at,
});

type CreateReservationInput = Omit<Reservation, 'id' | 'created_at'>;
type UpdateReservationInput = Partial<Omit<Reservation, 'id' | 'created_at' | 'trip_id'>> & {
  id: string;
};

const toRow = (input: CreateReservationInput, userId: string): TablesInsert<'reservations'> => ({
  user_id: userId,
  trip_id: input.trip_id,
  source: 'manual',
  type: input.type,
  title: input.title,
  status: input.status || 'pending',
  start_at: input.check_in,
  end_at: input.check_out,
  provider: input.provider,
  confirmation_code: input.confirmation_code,
  booking_url: input.booking_url,
  total_amount: input.amount,
  currency: input.currency,
  notes: input.notes,
});

const toUpdateRow = (input: Omit<UpdateReservationInput, 'id'>): TablesUpdate<'reservations'> => {
  const out: TablesUpdate<'reservations'> = {};
  if (input.type !== undefined) out.type = input.type;
  if (input.title !== undefined) out.title = input.title;
  if (input.status !== undefined) out.status = input.status;
  if (input.check_in !== undefined) out.start_at = input.check_in;
  if (input.check_out !== undefined) out.end_at = input.check_out;
  if (input.provider !== undefined) out.provider = input.provider;
  if (input.confirmation_code !== undefined) out.confirmation_code = input.confirmation_code;
  if (input.booking_url !== undefined) out.booking_url = input.booking_url;
  if (input.amount !== undefined) out.total_amount = input.amount;
  if (input.currency !== undefined) out.currency = input.currency;
  if (input.notes !== undefined) out.notes = input.notes;
  return out;
};

export function useTripReservations(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip-reservations', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select(
          'id, trip_id, type, title, confirmation_code, start_at, end_at, provider, booking_url, total_amount, currency, notes, status, created_at',
        )
        .eq('trip_id', tripId!)
        .order('start_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((r) => project(r as ReservationRow));
    },
    enabled: !!tripId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useReservationMutations(tripId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['trip-reservations', tripId] });
    void queryClient.invalidateQueries({ queryKey: ['reservations', user?.id] });
  };

  const addReservation = useMutation({
    mutationFn: async (input: CreateReservationInput) => {
      if (!user) throw new Error('not authenticated');
      const { data, error } = await supabase
        .from('reservations')
        .insert(toRow(input, user.id))
        .select(
          'id, trip_id, type, title, confirmation_code, start_at, end_at, provider, booking_url, total_amount, currency, notes, status, created_at',
        )
        .single();
      if (error) throw error;
      return project(data as ReservationRow);
    },
    onSuccess: invalidate,
  });

  const updateReservation = useMutation({
    mutationFn: async ({ id, ...input }: UpdateReservationInput) => {
      const { data, error } = await supabase
        .from('reservations')
        .update(toUpdateRow(input))
        .eq('id', id)
        .select(
          'id, trip_id, type, title, confirmation_code, start_at, end_at, provider, booking_url, total_amount, currency, notes, status, created_at',
        )
        .single();
      if (error) throw error;
      return project(data as ReservationRow);
    },
    onSuccess: invalidate,
  });

  const deleteReservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reservations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { addReservation, updateReservation, deleteReservation };
}
