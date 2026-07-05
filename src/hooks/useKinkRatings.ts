import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { KinkRating, KinkRatingValue, KinkSide } from '@/lib/kinks/types';

export interface RatingUpsert {
  item_id: string;
  side: KinkSide;
  rating: KinkRatingValue;
  needs_discussion?: boolean;
}

/** My full rating map, keyed `${item_id}:${side}`. */
export function useMyKinkRatings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['kink-ratings', 'me', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Map<string, KinkRating>> => {
      if (!user) return new Map();
      const { data, error } = await untypedFrom('kink_ratings')
        .select('user_id, item_id, side, rating, needs_discussion')
        .eq('user_id', user.id);
      if (error) throw error;
      const map = new Map<string, KinkRating>();
      for (const row of (data ?? []) as unknown as KinkRating[]) {
        map.set(`${row.item_id}:${row.side}`, row);
      }
      return map;
    },
  });
}

/** Batched upsert — one request per save (grid save / wizard step). */
export function useUpsertKinkRatings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: RatingUpsert[]) => {
      if (!user) throw new Error('not signed in');
      if (!rows.length) return;
      const payload = rows.map((r) => ({
        user_id: user.id,
        item_id: r.item_id,
        side: r.side,
        rating: r.rating,
        needs_discussion: r.needs_discussion ?? false,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await untypedFrom('kink_ratings').upsert(payload, {
        onConflict: 'user_id,item_id,side',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kink-ratings', 'me'] });
    },
  });
}

/** Clear a rating (back to "not entered"). */
export function useDeleteKinkRating() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { item_id: string; side: KinkSide }) => {
      if (!user) throw new Error('not signed in');
      const { error } = await untypedFrom('kink_ratings')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', args.item_id)
        .eq('side', args.side);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kink-ratings', 'me'] });
    },
  });
}
