import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'] & {
  venues?: { name: string; address: string; city: string } | null;
};

export function useMarketplaceListingsByIds(ids: string[], overviewOnly = false) {
  const [data, setData] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const key = ids.join(',');

  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      let query = supabase
        .from('marketplace_listings')
        .select('*, venues(name, address, city)')
        .in('id', ids)
        .eq('status', 'active');
      if (overviewOnly) query = query.eq('overview_eligible', true);
      const { data: rows, error } = await query;
      if (cancelled) return;
      if (error || !rows) setData([]);
      else {
        // preserve input order
        const lookup = new Map((rows as MarketplaceListing[]).map((r) => [r.id, r]));
        setData(ids.map((id) => lookup.get(id)).filter((x): x is MarketplaceListing => !!x));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, overviewOnly]);

  return { data, loading };
}
