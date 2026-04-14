import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Recommendation {
  id: string;
  rec_type: string;
  entity_type: string;
  entity_id: string;
  score: number;
  reason: string | null;
  metadata: Record<string, unknown>;
}

interface UseRecommendationsOptions {
  recType: 'destination' | 'hotel' | 'activity' | 'flight_deal';
  limit?: number;
  enabled?: boolean;
}

export function useRecommendations({
  recType,
  limit = 6,
  enabled = true,
}: UseRecommendationsOptions) {
  const { user } = useAuth();
  const sessionId = typeof window !== 'undefined' ? sessionStorage.getItem('qg_session_id') : null;

  return useQuery({
    queryKey: ['recommendations', recType, user?.id, sessionId, limit],
    queryFn: async (): Promise<Recommendation[]> => {
      // Try user-based recommendations first
      if (user) {
        const { data, error } = await supabase
          .from('user_recommendations')
          .select('*')
          .eq('user_id', user.id)
          .eq('rec_type', recType)
          .gt('expires_at', new Date().toISOString())
          .order('score', { ascending: false })
          .limit(limit);

        if (!error && data && data.length > 0) return data;
      }

      // Fall back to session-based for anonymous
      if (sessionId) {
        const { data, error } = await supabase
          .from('user_recommendations')
          .select('*')
          .eq('session_id', sessionId)
          .eq('rec_type', recType)
          .gt('expires_at', new Date().toISOString())
          .order('score', { ascending: false })
          .limit(limit);

        if (!error && data) return data;
      }

      return [];
    },
    enabled: enabled && (!!user || !!sessionId),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
