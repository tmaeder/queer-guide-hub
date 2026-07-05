import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { KinkCompareRow, KinkCompareSummary } from '@/lib/kinks/types';

/**
 * The mutual intersection. Ephemeral by design — short gc, refetch on grant
 * changes (a revoke must clear it promptly).
 */
export function useKinkCompare(otherId: string | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['kink-compare', 'rows', user?.id, otherId],
    enabled: enabled && !!user && !!otherId && otherId !== user?.id,
    gcTime: 60 * 1000,
    staleTime: 0,
    queryFn: async (): Promise<KinkCompareRow[]> => {
      const { data, error } = await untypedRpc<KinkCompareRow[]>('kink_compare', {
        p_other: otherId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useKinkCompareSummary(otherId: string | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['kink-compare', 'summary', user?.id, otherId],
    enabled: enabled && !!user && !!otherId && otherId !== user?.id,
    gcTime: 60 * 1000,
    staleTime: 0,
    queryFn: async (): Promise<KinkCompareSummary | null> => {
      const { data, error } = await untypedRpc<KinkCompareSummary>('kink_compare_summary', {
        p_other: otherId,
      });
      if (error) throw error;
      return data ?? null;
    },
  });
}
