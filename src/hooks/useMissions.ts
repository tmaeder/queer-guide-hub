import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CommunityDomain } from '@/lib/score';

export interface MissionStatus {
  slug: string;
  title: string;
  description: string;
  domain: CommunityDomain;
  period: 'weekly' | 'seasonal' | 'one_shot';
  points_reward: number;
  target: number;
  progress: number;
  completed: boolean;
  sort_order: number;
}

/**
 * Live-computed mission progress for the current user. Reads via the
 * my_missions() RPC which calls compute_user_missions(auth.uid()).
 * Cached 60s — quests aren't load-bearing for correctness, just freshness.
 */
export function useMissions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['missions', 'me', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<MissionStatus[]> => {
      if (!user) return [];
      const { data, error } = await supabase.rpc('my_missions');
      if (error) throw error;
      return (data as MissionStatus[]) ?? [];
    },
  });
}
