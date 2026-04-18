import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ConciergeDraftPlace {
  venue_id?: string;
  event_id?: string;
  custom_name?: string;
  notes?: string;
}
export interface ConciergeDraftDay {
  date: string;
  places: ConciergeDraftPlace[];
}
export interface ConciergeDraft {
  days: ConciergeDraftDay[];
}

export interface ConciergeMessage {
  id: string;
  trip_id: string;
  role: 'user' | 'assistant';
  content: string;
  draft: ConciergeDraft | null;
  created_at: string;
}

const KEY = (tripId: string) => ['trip-concierge', tripId] as const;

/**
 * Loads the persisted conversation thread for a trip's AI concierge.
 * Each row in `trip_concierge_messages` is a turn (user or assistant);
 * assistant turns may carry a structured `draft` the user can apply.
 */
export function useTripConcierge(tripId: string | undefined) {
  return useQuery({
    queryKey: KEY(tripId ?? ''),
    enabled: !!tripId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ConciergeMessage[]> => {
      if (!tripId) return [];
      const { data, error } = await supabase
        .from('trip_concierge_messages')
        .select('id, trip_id, role, content, draft, created_at')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as ConciergeMessage[];
    },
  });
}

interface SendResult {
  reply: string;
  draft?: ConciergeDraft;
  candidates_used: number;
}

/**
 * Sends a user message to the `trip-concierge` edge function. The function
 * persists both the user message and the assistant reply, so we just
 * invalidate after the round-trip to refetch the full thread.
 */
export function useSendConciergeMessage(tripId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (message: string): Promise<SendResult> => {
      if (!tripId) throw new Error('no trip');
      const trimmed = message.trim();
      if (!trimmed) throw new Error('empty message');
      const { data, error } = await supabase.functions.invoke('trip-concierge', {
        body: { trip_id: tripId, message: trimmed },
      });
      if (error) throw error;
      return data as SendResult;
    },
    onSuccess: () => {
      if (tripId) void queryClient.invalidateQueries({ queryKey: KEY(tripId) });
    },
  });
}
