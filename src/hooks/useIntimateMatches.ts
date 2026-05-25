import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface IntimateMatch {
  viewer_id: string;
  other_id: string;
  matched_at: string;
}

export interface IntimateLikeRow {
  actor_id: string;
  target_id: string;
  created_at: string;
}

/** Liked targets the current user has acted on. Used by /discover to exclude. */
export function useMyIntimateLikes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-likes', 'me', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<string[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('intimate_likes' as any)
        .select('target_id')
        .eq('actor_id', user.id);
      if (error) throw error;
      return ((data as { target_id: string }[]) ?? []).map((r) => r.target_id);
    },
  });
}

/** Passed targets the current user has acted on. */
export function useMyIntimatePasses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-passes', 'me', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<string[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('intimate_passes' as any)
        .select('target_id')
        .eq('actor_id', user.id);
      if (error) throw error;
      return ((data as { target_id: string }[]) ?? []).map((r) => r.target_id);
    },
  });
}

/** Current user's mutual matches via the security-invoker view. */
export function useIntimateMatches() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-matches', 'me', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<IntimateMatch[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('intimate_matches' as any)
        .select('viewer_id, other_id, matched_at')
        .order('matched_at', { ascending: false });
      if (error) throw error;
      return (data as IntimateMatch[]) ?? [];
    },
  });
}

/** Like action — invalidates likes + matches caches on success. */
export function useLikeTarget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('intimate_likes' as any)
        .insert({ actor_id: user.id, target_id: targetId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimate-likes', 'me'] });
      qc.invalidateQueries({ queryKey: ['intimate-matches', 'me'] });
      qc.invalidateQueries({ queryKey: ['intimate-discovery'] });
    },
  });
}

/** Pass action — silently filters target out of future discovery results. */
export function usePassTarget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('intimate_passes' as any)
        .insert({ actor_id: user.id, target_id: targetId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimate-passes', 'me'] });
      qc.invalidateQueries({ queryKey: ['intimate-discovery'] });
    },
  });
}

/**
 * Subscribe to NEW likes whose target is the current user. When the reverse
 * exists (handled by trigger creating a conversation), this fires for the
 * receiving side; consumers should toast a match notification + refetch.
 */
export function useIncomingLikeListener(onIncoming: (row: IntimateLikeRow) => void) {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`intimate-likes-in:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'intimate_likes',
          filter: `target_id=eq.${user.id}`,
        },
        (payload) => onIncoming(payload.new as IntimateLikeRow),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, onIncoming]);
}
