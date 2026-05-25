import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ThreadConsent {
  conversation_id: string;
  matched_at: string;
  photo_unlocked_a: boolean;
  photo_unlocked_b: boolean;
  location_shared_at: string | null;
  location_expires_at: string | null;
  ended_at: string | null;
  ended_by: string | null;
}

export interface OpeningMove {
  slug: string;
  prompt: string;
  tone: 'warm' | 'playful' | 'direct' | 'curious';
  locale: string;
  sort_order: number;
}

/** Read consent state for a match conversation. */
export function useIntimateThreadConsent(conversationId: string | null) {
  return useQuery({
    queryKey: ['intimate-thread-consent', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<ThreadConsent | null> => {
      if (!conversationId) return null;
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('intimate_thread_consent' as any)
        .select('*')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      return (data as ThreadConsent | null) ?? null;
    },
  });
}

/** End the conversation softly (no notification; mutual). */
export function useEndIntimateThread(conversationId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!conversationId || !user) throw new Error('not signed in');
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('intimate_thread_consent' as any)
        .update({ ended_at: new Date().toISOString(), ended_by: user.id })
        .eq('conversation_id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimate-thread-consent', conversationId] });
    },
  });
}

/** Determine which side ('a' or 'b') the current user is on in a match thread. */
export function useMyConsentSide(conversationId: string | null) {
  return useQuery({
    queryKey: ['intimate-thread-side', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<'a' | 'b' | null> => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .rpc('intimate_my_consent_side' as any, { p_conversation_id: conversationId });
      if (error) throw error;
      return (data as 'a' | 'b' | null) ?? null;
    },
  });
}

/** Toggle the caller's photo-unlock flag. Server resolves a/b from participants. */
export function useSetPhotoUnlock(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unlocked: boolean) => {
      if (!conversationId) throw new Error('no conversation');
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .rpc('intimate_set_my_photo_unlock' as any, {
          p_conversation_id: conversationId,
          p_unlocked: unlocked,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimate-thread-consent', conversationId] });
    },
  });
}

/** Share / withdraw live location for the match thread. Minutes clamps to [5, 240]. */
export function useShareLocation(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (minutes: number | null) => {
      if (!conversationId) throw new Error('no conversation');
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .rpc('intimate_share_my_location' as any, {
          p_conversation_id: conversationId,
          p_minutes: minutes,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimate-thread-consent', conversationId] });
    },
  });
}

/** Curated conversation starter prompts (locale defaults to 'en'). */
export function useOpeningMoves(locale = 'en') {
  return useQuery({
    queryKey: ['intimate-opening-moves', locale],
    queryFn: async (): Promise<OpeningMove[]> => {
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('intimate_opening_moves' as any)
        .select('slug, prompt, tone, locale, sort_order')
        .eq('locale', locale)
        .order('sort_order', { ascending: true });
      return (data as OpeningMove[]) ?? [];
    },
  });
}
