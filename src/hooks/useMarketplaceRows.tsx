import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'] & {
  venues?: { name: string; address: string; city: string } | null;
};

const BASE_SELECT = `*, venues(name, address, city)`;

export type CuratedRowKey = 'featured' | 'new' | 'most-relevant' | 'price-drops';

interface RowState {
  data: MarketplaceListing[];
  loading: boolean;
  error: string | null;
}

const initial: RowState = { data: [], loading: true, error: null };

async function fetchRow(key: CuratedRowKey, limit = 12): Promise<MarketplaceListing[]> {
  let q = supabase
    .from('marketplace_listings')
    .select(BASE_SELECT)
    .eq('status', 'active')
    .limit(limit);

  switch (key) {
    case 'featured':
      q = q.eq('featured', true).order('updated_at', { ascending: false });
      break;
    case 'new': {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte('created_at', since).order('created_at', { ascending: false });
      break;
    }
    case 'most-relevant':
      q = q
        .gte('lgbti_relevance_score', 0.85)
        .order('lgbti_relevance_score', { ascending: false, nullsFirst: false })
        .order('quality_score', { ascending: false, nullsFirst: false });
      break;
    case 'price-drops': {
      const ids = await fetchPriceDropIds(limit * 2);
      if (ids.length === 0) return [];
      q = q.in('id', ids).order('updated_at', { ascending: false });
      break;
    }
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MarketplaceListing[];
}

/**
 * Find listings whose USD price has dropped in the last 30 days.
 * Pulls recent price_history, groups by listing_id, picks ids where
 * latest < earliest in window. Limited to keep payload light.
 */
async function fetchPriceDropIds(targetCount: number): Promise<string[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('marketplace_price_history')
    .select('listing_id, observed_at, price_usd')
    .gte('observed_at', since)
    .not('price_usd', 'is', null)
    .order('observed_at', { ascending: true })
    .limit(5000);
  if (error || !data) return [];

  const byListing = new Map<string, { first: number; last: number }>();
  for (const row of data as Array<{ listing_id: string; price_usd: number | null }>) {
    if (row.price_usd == null) continue;
    const cur = byListing.get(row.listing_id);
    if (!cur) byListing.set(row.listing_id, { first: row.price_usd, last: row.price_usd });
    else cur.last = row.price_usd;
  }
  return Array.from(byListing.entries())
    .filter(([, v]) => v.last < v.first)
    .sort((a, b) => (a[1].last - a[1].first) - (b[1].last - b[1].first)) // biggest drop first (most negative)
    .slice(0, targetCount)
    .map(([id]) => id);
}

export function useMarketplaceRow(key: CuratedRowKey, limit = 12): RowState {
  const [state, setState] = useState<RowState>(initial);
  useEffect(() => {
    let cancelled = false;
    setState({ data: [], loading: true, error: null });
    fetchRow(key, limit)
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ data: [], loading: false, error: err instanceof Error ? err.message : 'Failed to load' });
      });
    return () => {
      cancelled = true;
    };
  }, [key, limit]);
  return state;
}

/**
 * Single random featured listing for the hero spotlight.
 * Picks the most recently updated featured listing for stability across renders.
 */
export function useMarketplaceSpotlight(): { listing: MarketplaceListing | null; loading: boolean } {
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('marketplace_listings')
          .select(BASE_SELECT)
          .eq('status', 'active')
          .eq('featured', true)
          .not('images', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        if (cancelled) return;
        setListing(((data ?? [])[0] as MarketplaceListing | undefined) ?? null);
      } catch {
        if (!cancelled) setListing(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { listing, loading };
}
