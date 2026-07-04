import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SFW_RATINGS } from '@/hooks/useMarketplace';
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
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

export function useMarketplaceSubcategoryTiles(limit: number | null = 8) {
  return useAsync<SubcategoryTile[]>(
    [limit],
    async () => {
      // Server-side aggregation. The legacy client-side aggregator silently
      // truncated to the first ~1000 rows (Supabase db.max_rows default),
      // skewing tile counts. The RPC GROUP BYs server-side, no row cap.
      const { data, error } = await supabase.rpc('get_marketplace_subcategory_counts');
      if (error || !data) return [];
      type Row = { slug: string | null; count: number | string | null };
      const rows = (data as Row[])
        .filter((r): r is { slug: string; count: number | string } => !!r.slug && r.count != null)
        .map((r) => ({
          slug: r.slug,
          count: typeof r.count === 'string' ? parseInt(r.count, 10) : r.count,
        }));
      return limit == null ? rows : rows.slice(0, limit);
    },
    [],
  );
}

export interface MarketplaceAttributeOption {
  slug: string;       // namespaced unified_tags slug (mat-cotton, occ-pride, vibe-minimal)
  name: string;
  kind: 'material' | 'occasion' | 'vibe';
}

/** Controlled attribute vocabulary (material / occasion / vibe) from unified_tags. */
export function useMarketplaceAttributeVocab() {
  return useAsync<MarketplaceAttributeOption[]>(
    [],
    async () => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('slug, name, category')
        .in('category', ['material', 'occasion', 'vibe'])
        .eq('status', 'active')
        .order('name');
      if (error || !data) return [];
      return data
        .filter((t): t is { slug: string; name: string; category: string } => !!t.slug && !!t.name)
        .map((t) => ({ slug: t.slug, name: t.name, kind: t.category as MarketplaceAttributeOption['kind'] }));
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
      // Cross-site surface: sfw/suggestive only, regardless of the
      // /marketplace-scoped 18+ opt-in.
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*, venues(name, address, city)')
        .eq('status', 'active')
        .in('content_rating', SFW_RATINGS)
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
        .in('content_rating', SFW_RATINGS)
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

/**
 * SFW listings carrying an occasion tag (occ-pride, occ-drag, occ-wedding)
 * for contextual rails — e.g. Pride outfits on a Pride event page.
 */
export function useMarketplaceListingsForOccasion(occasionSlug: string | undefined, limit = 8) {
  return useAsync<MarketplaceListing[]>(
    [occasionSlug, limit],
    async () => {
      if (!occasionSlug) return [];
      const { data: tagRows } = await supabase
        .from('unified_tag_assignments')
        .select('entity_id, unified_tags!inner(slug)')
        .eq('entity_type', 'marketplace_listing')
        .eq('unified_tags.slug', occasionSlug)
        .limit(500);
      const ids = Array.from(new Set((tagRows ?? []).map((r) => r.entity_id as string)));
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('status', 'active')
        .in('id', ids)
        .in('content_rating', ['sfw', 'suggestive'])
        .not('images', 'is', null)
        .order('boutique_score', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error || !data) return [];
      return data as MarketplaceListing[];
    },
    [],
  );
}

export function useMarketplaceListingsForCountry(countryId: string | undefined, limit = 4) {
  return useAsync<MarketplaceListing[]>(
    [countryId, limit],
    async () => {
      if (!countryId) return [];
      // Inner join to venues filtered by country_id — surfaces marketplace items
      // hosted by any venue in that country.
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*, venues!inner(name, address, city)')
        .eq('status', 'active')
        .in('content_rating', SFW_RATINGS)
        .eq('venues.country_id', countryId)
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
        .in('content_rating', SFW_RATINGS)
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
        .in('content_rating', SFW_RATINGS)
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
 * Compute facet counts for the current filter scope via the server-side
 * RPC `get_marketplace_facets`. Each per-dimension bucket excludes its own
 * filter so the dropdown can show true alternates (e.g. "Products (998)"
 * keeps reading 998 after the user selects it). `search` is intentionally
 * ignored — counts reflect the broader filter context.
 */
export function useMarketplaceFacets(opts: {
  category?: string;
  subcategory?: string;
  businessType?: string;
  categoryId?: string;
}) {
  return useAsync<FacetCounts>(
    [opts.category, opts.subcategory, opts.businessType, opts.categoryId],
    async () => {
      const { data, error } = await supabase.rpc('get_marketplace_facets', {
        p_category: opts.category ?? null,
        p_subcategory: opts.subcategory ?? null,
        p_business_type: opts.businessType ?? null,
        p_category_id: opts.categoryId ?? null,
      });
      if (error || !data) return EMPTY_FACETS;
      const payload = data as {
        total?: number | string;
        by_category?: Record<string, number | string>;
        by_subcategory?: Record<string, number | string>;
        by_business_type?: Record<string, number | string>;
      };
      const toMap = (rec: Record<string, number | string> | undefined) => {
        const m = new Map<string, number>();
        if (!rec) return m;
        for (const [k, v] of Object.entries(rec)) {
          m.set(k, typeof v === 'string' ? parseInt(v, 10) : v);
        }
        return m;
      };
      const total = typeof payload.total === 'string' ? parseInt(payload.total, 10) : payload.total ?? 0;
      return {
        category: toMap(payload.by_category),
        subcategory: toMap(payload.by_subcategory),
        business_type: toMap(payload.by_business_type),
        total,
      };
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
