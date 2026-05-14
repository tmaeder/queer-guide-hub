import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'] & {
  venues?: { name: string; address: string; city: string } | null;
};

interface SubcategoryTile {
  slug: string;
  count: number;
}

function useAsync<T>(deps: React.DependencyList, run: () => Promise<T>, initial: T): { data: T; loading: boolean } {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    run()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(initial);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

export function useMarketplaceSubcategoryTiles() {
  return useAsync<SubcategoryTile[]>(
    [],
    async () => {
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('subcategory')
        .eq('status', 'active')
        .not('subcategory', 'is', null)
        .limit(2000);
      if (error || !data) return [];
      const counts = new Map<string, number>();
      for (const row of data as Array<{ subcategory: string | null }>) {
        if (!row.subcategory) continue;
        counts.set(row.subcategory, (counts.get(row.subcategory) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([slug, count]) => ({ slug, count }));
    },
    [],
  );
}

export function useMarketplaceListingsRelated(limit = 4) {
  // Generic "related products" surface for cross-product hooks (news, blog).
  // Prefers featured listings; orders by relevance score where available.
  return useAsync<MarketplaceListing[]>(
    [limit],
    async () => {
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*, venues(name, address, city)')
        .eq('status', 'active')
        .order('featured', { ascending: false })
        .order('lgbti_relevance_score', { ascending: false, nullsFirst: false })
        .order('quality_score', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error || !data) return [];
      return data as MarketplaceListing[];
    },
    [],
  );
}

interface CityChip {
  name: string;
  slug: string | null;
  count: number;
}

/**
 * Top cities by number of active marketplace listings hosted there.
 * Joins venues for city name + city slug, aggregates client-side, takes top N.
 */
export function useMarketplaceTopCities(limit = 10) {
  return useAsync<CityChip[]>(
    [limit],
    async () => {
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('venues!inner(city, cities(slug))')
        .eq('status', 'active')
        .limit(2000);
      if (error || !data) return [];
      type Row = { venues: { city: string | null; cities?: { slug: string | null } | null } | null };
      const counts = new Map<string, { count: number; slug: string | null }>();
      for (const row of data as unknown as Row[]) {
        const city = row.venues?.city;
        if (!city) continue;
        const slug = row.venues?.cities?.slug ?? null;
        const cur = counts.get(city);
        if (cur) cur.count += 1;
        else counts.set(city, { count: 1, slug });
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, limit)
        .map(([name, { count, slug }]) => ({ name, slug, count }));
    },
    [],
  );
}

export function useMarketplaceListingsForCity(cityName: string | undefined, limit = 4) {
  return useAsync<MarketplaceListing[]>(
    [cityName, limit],
    async () => {
      if (!cityName) return [];
      // Inner join to venues filtered by city; surfaces marketplace items hosted by venues in that city.
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*, venues!inner(name, address, city)')
        .eq('status', 'active')
        .eq('venues.city', cityName)
        .order('featured', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error || !data) return [];
      return data as MarketplaceListing[];
    },
    [],
  );
}

export function useMarketplaceListingsForVenue(venueId: string | undefined, limit = 4) {
  return useAsync<MarketplaceListing[]>(
    [venueId, limit],
    async () => {
      if (!venueId) return [];
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*, venues(name, address, city)')
        .eq('status', 'active')
        .eq('venue_id', venueId)
        .order('featured', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error || !data) return [];
      return data as MarketplaceListing[];
    },
    [],
  );
}

export function useMarketplaceSimilarListings(listing: MarketplaceListing | null, limit = 4) {
  return useAsync<MarketplaceListing[]>(
    [listing?.id, listing?.category, listing?.category_id, limit],
    async () => {
      if (!listing) return [];
      let q = supabase
        .from('marketplace_listings')
        .select('*, venues(name, address, city)')
        .eq('status', 'active')
        .neq('id', listing.id)
        .limit(limit);
      if (listing.category_id) q = q.eq('category_id', listing.category_id);
      else if (listing.category) q = q.eq('category', listing.category);
      q = q
        .order('lgbti_relevance_score', { ascending: false, nullsFirst: false })
        .order('quality_score', { ascending: false, nullsFirst: false });
      const { data, error } = await q;
      if (error || !data) return [];
      return data as MarketplaceListing[];
    },
    [],
  );
}

interface PricePoint {
  observed_at: string;
  price_usd: number;
}

interface FacetCounts {
  category: Map<string, number>;
  subcategory: Map<string, number>;
  business_type: Map<string, number>;
  total: number;
}

const EMPTY_FACETS: FacetCounts = {
  category: new Map(),
  subcategory: new Map(),
  business_type: new Map(),
  total: 0,
};

/**
 * Compute facet counts for the current filter scope.
 * One query: pulls categorical fields for all matching listings, aggregates in JS.
 * `search` is intentionally ignored — counts reflect the broader filter context so
 * users see all available refinements while typing.
 */
export function useMarketplaceFacets(opts: {
  category?: string;
  subcategory?: string;
  businessType?: string;
}) {
  return useAsync<FacetCounts>(
    [opts.category, opts.subcategory, opts.businessType],
    async () => {
      let q = supabase
        .from('marketplace_listings')
        .select('category, subcategory, business_type')
        .eq('status', 'active')
        .limit(10000);
      if (opts.category) q = q.eq('category', opts.category);
      if (opts.subcategory) q = q.eq('subcategory', opts.subcategory);
      if (opts.businessType) q = q.eq('business_type', opts.businessType);
      const { data, error } = await q;
      if (error || !data) return EMPTY_FACETS;
      const facets: FacetCounts = {
        category: new Map(),
        subcategory: new Map(),
        business_type: new Map(),
        total: data.length,
      };
      type Row = { category: string | null; subcategory: string | null; business_type: string | null };
      for (const row of data as Row[]) {
        if (row.category) facets.category.set(row.category, (facets.category.get(row.category) ?? 0) + 1);
        if (row.subcategory)
          facets.subcategory.set(row.subcategory, (facets.subcategory.get(row.subcategory) ?? 0) + 1);
        if (row.business_type)
          facets.business_type.set(row.business_type, (facets.business_type.get(row.business_type) ?? 0) + 1);
      }
      return facets;
    },
    EMPTY_FACETS,
  );
}

export function useMarketplacePriceHistory(listingId: string, days = 90) {
  return useAsync<PricePoint[]>(
    [listingId, days],
    async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('marketplace_price_history')
        .select('observed_at, price_usd')
        .eq('listing_id', listingId)
        .gte('observed_at', since)
        .not('price_usd', 'is', null)
        .order('observed_at', { ascending: true })
        .limit(120);
      if (error || !data) return [];
      return data.filter((d): d is PricePoint => typeof d.price_usd === 'number');
    },
    [],
  );
}
