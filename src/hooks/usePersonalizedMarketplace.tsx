import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

export type PersonalizationReason = 'tag_overlap' | 'follows' | 'interests';

/**
 * Tag-overlap-ranked marketplace listings for a given user. Wraps the
 * `get_personalized_marketplace_listings` SECURITY DEFINER RPC + the
 * follow-up listing fetch in one hook so the rail component never
 * touches `supabase.from()` directly.
 *
 * v2 seeds: saved-listing tags ∪ followed tags ∪ profile interests; each
 * listing carries the dominant `reason` so rails can label rows.
 */
export function usePersonalizedMarketplaceListings(
  userId: string | undefined,
  limit = 12,
  includeAdult = false,
) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [reasons, setReasons] = useState<Map<string, PersonalizationReason>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setListings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: ranks, error } = await supabase.rpc(
        'get_personalized_marketplace_listings',
        { p_user_id: userId, p_limit: limit, p_include_adult: includeAdult },
      );
      if (cancelled || error || !ranks || ranks.length === 0) {
        if (!cancelled) {
          setListings([]);
          setReasons(new Map());
          setLoading(false);
        }
        return;
      }
      type Rank = { listing_id: string; score: number; reason: PersonalizationReason };
      const ids = (ranks as Rank[]).map((r) => r.listing_id);
      const reasonMap = new Map((ranks as Rank[]).map((r) => [r.listing_id, r.reason] as const));
      const { data: rows } = await supabase
        .from('marketplace_listings')
        .select('*, marketplace_reviews(rating), marketplace_favorites(id), venues(name, address, city)')
        .eq('status', 'active')
        .in('id', ids);
      if (cancelled) return;
      const byId = new Map((rows ?? []).map((r) => [r.id, r] as const));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as MarketplaceListing[];
      setListings(ordered);
      setReasons(reasonMap);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, limit, includeAdult]);

  return { listings, reasons, loading };
}
