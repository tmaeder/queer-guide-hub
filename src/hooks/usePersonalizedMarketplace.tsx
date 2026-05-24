import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

/**
 * Tag-overlap-ranked marketplace listings for a given user. Wraps the
 * `get_personalized_marketplace_listings` SECURITY DEFINER RPC + the
 * follow-up listing fetch in one hook so the rail component never
 * touches `supabase.from()` directly.
 */
export function usePersonalizedMarketplaceListings(userId: string | undefined, limit = 12) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setListings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: ranks, error } = await supabase.rpc(
        'get_personalized_marketplace_listings',
        { p_user_id: userId, p_limit: limit },
      );
      if (cancelled || error || !ranks || ranks.length === 0) {
        if (!cancelled) {
          setListings([]);
          setLoading(false);
        }
        return;
      }
      type Rank = { listing_id: string; score: number; reason: string };
      const ids = (ranks as Rank[]).map((r) => r.listing_id);
      const { data: rows } = await supabase
        .from('marketplace_listings')
        .select('*, marketplace_reviews(rating), marketplace_favorites(id), venues(name, address, city)')
        .eq('status', 'active')
        .in('id', ids);
      if (cancelled) return;
      const byId = new Map((rows ?? []).map((r) => [r.id, r] as const));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as MarketplaceListing[];
      setListings(ordered);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, limit]);

  return { listings, loading };
}
