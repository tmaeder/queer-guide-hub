import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface TripMessage {
  id: string;
  trip_id: string;
  sender_id: string;
  content: string;
  reply_to: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  sender?: { display_name: string | null; avatar_url: string | null } | null;
}

const KEY = (tripId: string) => ['trip-messages', tripId] as const;

/**
 * Subscribes to a trip's chat. Pulls the last 200 messages (oldest first),
 * and maintains parity with Supabase Realtime for INSERT events so new
 * messages show up immediately for every member.
 */
export function useTripChat(tripId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`trip_messages:${tripId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trip_messages', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          queryClient.setQueryData<TripMessage[]>(KEY(tripId), (prev) => {
            const next = prev ? [...prev] : [];
            const row = payload.new as TripMessage;
            if (next.some((m) => m.id === row.id)) return next;
            next.push(row);
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId, queryClient]);

  return useQuery({
    queryKey: KEY(tripId ?? ''),
    enabled: !!tripId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<TripMessage[]> => {
      if (!tripId) return [];
      const { data, error } = await supabase
        .from('trip_messages')
        .select('*, sender:profiles!sender_id(display_name, avatar_url)')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TripMessage[];
    },
  });
}

export function useSendTripMessage(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ content, replyTo }: { content: string; replyTo?: string | null }) => {
      if (!tripId || !user) throw new Error('not authenticated');
      const trimmed = content.trim();
      if (!trimmed) return;
      const { error } = await supabase.from('trip_messages').insert({
        trip_id: tripId,
        sender_id: user.id,
        content: trimmed,
        reply_to: replyTo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (tripId) void queryClient.invalidateQueries({ queryKey: KEY(tripId) });
    },
  });
}
