import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { KinkCategoryVisibility, KinkTier } from '@/lib/kinks/types';

/** My per-category tiers, keyed by category_id. Missing row = 'private'. */
export function useMyKinkVisibility() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['kink-visibility', 'me', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Map<string, KinkCategoryVisibility>> => {
      if (!user) return new Map();
      const { data, error } = await untypedFrom('kink_category_visibility')
        .select('category_id, tier, include_in_share')
        .eq('user_id', user.id);
      if (error) throw error;
      const map = new Map<string, KinkCategoryVisibility>();
      for (const row of (data ?? []) as unknown as KinkCategoryVisibility[]) {
        map.set(row.category_id, row);
      }
      return map;
    },
  });
}

export function useSetKinkVisibility() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    // Full rows only — callers merge from useMyKinkVisibility() state first
    // (a partial upsert would reset the omitted column to its default).
    mutationFn: async (
      rows: { category_id: string; tier: KinkTier; include_in_share: boolean }[],
    ) => {
      if (!user) throw new Error('not signed in');
      if (!rows.length) return;
      const payload = rows.map((r) => ({
        user_id: user.id,
        category_id: r.category_id,
        tier: r.tier,
        include_in_share: r.include_in_share,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await untypedFrom('kink_category_visibility').upsert(payload, {
        onConflict: 'user_id,category_id',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kink-visibility', 'me'] });
    },
  });
}
