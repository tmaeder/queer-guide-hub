import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { KinkVisibleRow } from '@/lib/kinks/types';

/**
 * What `ownerId` shows me, per their tier ladder (positives only — the RPC
 * never returns no/hard_limit rows).
 */
export function useKinkVisibleList(ownerId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['kink-visible', user?.id, ownerId],
    enabled: !!user && !!ownerId && ownerId !== user?.id,
    queryFn: async (): Promise<KinkVisibleRow[]> => {
      const { data, error } = await untypedRpc<KinkVisibleRow[]>('kink_get_visible', {
        p_owner: ownerId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
