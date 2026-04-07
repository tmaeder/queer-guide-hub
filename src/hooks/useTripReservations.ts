import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

type CreateReservationInput = Omit<Reservation, 'id' | 'created_at'>;
type UpdateReservationInput = Partial<Omit<Reservation, 'id' | 'created_at' | 'trip_id'>> & { id: string };

export function useTripReservations(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip-reservations', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_reservations')
        .select('*')
        .eq('trip_id', tripId!)
        .order('check_in', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as Reservation[];
    },
    enabled: !!tripId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useReservationMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['trip-reservations', tripId] });

  const addReservation = useMutation({
    mutationFn: async (input: CreateReservationInput) => {
      const { data, error } = await supabase
        .from('trip_reservations')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Reservation;
    },
    onSuccess: invalidate,
  });

  const updateReservation = useMutation({
    mutationFn: async ({ id, ...input }: UpdateReservationInput) => {
      const { data, error } = await supabase
        .from('trip_reservations')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Reservation;
    },
    onSuccess: invalidate,
  });

  const deleteReservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_reservations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { addReservation, updateReservation, deleteReservation };
}
