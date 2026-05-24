import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { queryWithRetry } from '@/utils/fetchWithRetry';
import { searchFetch } from '@/lib/searchFetch';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
type MarketplaceListingInsert = Database['public']['Tables']['marketplace_listings']['Insert'];

export const PAGE_SIZE = 24;

export type MarketplaceSort =
  | 'for_you'
  | 'most_loved'
  | 'best_value'
  | 'editor_choice'
  | 'newest'
  | 'price_asc'
  | 'price_desc';

export interface MarketplaceFiltersInput {
  category?: string;
  subcategory?: string;
  location?: string;
  priceRange?: { min: number; max: number };
  tags?: string[];
  search?: string;
  businessType?: string;
  categoryId?: string;
  merchantDomain?: string;
}

export function useMarketplace() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  const fetchListings = async (
    filters?: MarketplaceFiltersInput,
    page = 0,
    sort: MarketplaceSort = 'for_you',
  ) => {
    try {
      setLoading(true);
      setLoadingTimedOut(false);
      setError(null);

      // Resolve tag slugs → entity ids via unified_tag_assignments. The
      // listings table has no `tags` column; tags live in the junction.
      // Mirrors the pattern in useHotels.
      let tagFilteredIds: string[] | null = null;
      if (filters?.tags && filters.tags.length > 0) {
        const { data: tagRows } = await supabase
          .from('unified_tag_assignments')
          .select('entity_id, unified_tags!inner(slug)')
          .eq('entity_type', 'marketplace_listing')
          .in('unified_tags.slug', filters.tags)
          .limit(5000);
        const ids = (tagRows ?? []).map((r) => r.entity_id as string);
        tagFilteredIds = Array.from(new Set(ids));
        if (tagFilteredIds.length === 0) {
          setListings([]);
          setTotal(0);
          return;
        }
      }

      // ── Search branch ─────────────────────────────────────────────
      // When a query is set, route through the search-proxy worker /
      // Meilisearch. The old Postgres `.or(title.ilike.%X%,...)` path
      // broke on whitespace inside the OR-expression, returning 0 hits
      // for any multi-word query. Meili tokenises naturally and ranks.
      //
      // We get back IDs + scores; then fetch the full listing rows from
      // Supabase (preserving order) so cards keep their joined reviews,
      // favorites, and venue data. On any search-proxy failure we fall
      // back to the legacy ilike path so the site keeps working.
      if (filters?.search && filters.search.trim().length >= 2) {
        try {
          const data = await searchFetch<{
            hits?: Array<{ id?: string; objectID?: string; type?: string }>;
            totalHits?: number;
          }>('/', {
            query: filters.search.trim(),
            filters: { types: ['marketplace'] },
            hitsPerPage: PAGE_SIZE,
            // search-proxy expects 0-based page indices (validInt min:0,
            // default:0) and computes Meili offset = page * limit. Sending
            // page+1 here skipped the first PAGE_SIZE hits and returned
            // empty arrays for narrow queries like "M2193" (4 total hits,
            // none surfaced because offset jumped past them).
            page,
          });
          const hits = data?.hits ?? [];
          const ids = hits
            .map((h) => (h?.id ?? h?.objectID ?? '').toString())
            .filter(Boolean);
          if (ids.length === 0) {
            setListings([]);
            setTotal(data?.totalHits ?? 0);
            return;
          }
          const constrainedIds = tagFilteredIds ? ids.filter((id) => tagFilteredIds!.includes(id)) : ids;
          if (constrainedIds.length === 0) {
            setListings([]);
            setTotal(0);
            return;
          }
          const { data: rows, error: rowsErr } = await supabase
            .from('marketplace_listings')
            .select(
              `*, marketplace_reviews(rating), marketplace_favorites(id), venues(name, address, city)`,
            )
            .eq('status', 'active')
            .in('id', constrainedIds);
          if (rowsErr) throw rowsErr;
          const byId = new Map((rows ?? []).map((r) => [r.id, r] as const));
          const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as MarketplaceListing[];
          setListings(ordered);
          setTotal(data?.totalHits ?? ordered.length);
          return;
        } catch (searchErr) {
          // Fall through to the Postgres path. Log for triage but don't
          // surface — the user gets results either way.
          console.warn('marketplace search-proxy failed, falling back', searchErr);
        }
      }

      let query = supabase
        .from('marketplace_listings')
        .select(
          `
          *,
          marketplace_reviews(rating),
          marketplace_favorites(id),
          venues(name, address, city)
        `,
          { count: 'exact' },
        )
        .eq('status', 'active');

      // 'for_you' falls back to 'most_loved' until the marketplace-rank
      // edge function lands (Phase D). Both feature-pin first so editorially
      // chosen items always lead.
      switch (sort) {
        case 'price_asc':
          query = query
            .order('featured', { ascending: false })
            .order('price_usd', { ascending: true, nullsFirst: false });
          break;
        case 'price_desc':
          query = query
            .order('featured', { ascending: false })
            .order('price_usd', { ascending: false, nullsFirst: false });
          break;
        case 'newest':
          query = query
            .order('featured', { ascending: false })
            .order('created_at', { ascending: false });
          break;
        case 'editor_choice':
          query = query
            .order('featured', { ascending: false })
            .order('quality_score', { ascending: false, nullsFirst: false })
            .order('updated_at', { ascending: false });
          break;
        case 'best_value':
          // Heuristic until a server-side computed score exists: rank by
          // quality_score desc, tiebreak by ascending price so higher-quality
          // cheaper items surface. Pure products only is enforced via the
          // existing category filter when callers want that.
          query = query
            .order('featured', { ascending: false })
            .order('quality_score', { ascending: false, nullsFirst: false })
            .order('price_usd', { ascending: true, nullsFirst: false });
          break;
        case 'most_loved':
        case 'for_you':
        default:
          query = query
            .order('featured', { ascending: false })
            .order('views_count', { ascending: false, nullsFirst: false })
            .order('quality_score', { ascending: false, nullsFirst: false })
            .order('lgbti_relevance_score', { ascending: false, nullsFirst: false });
          break;
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.subcategory) {
        // Match against the canonical generated column so the URL slug
        // (`fetish_gear`) lines up with stored values that may have come
        // through hyphenated or title-cased ("Fetish Gear").
        const slug = filters.subcategory
          .toLowerCase()
          .replace(/[\s-]+/g, '_');
        query = query.eq('subcategory_slug', slug);
      }

      if (filters?.location) {
        query = query.ilike('location', `%${filters.location}%`);
      }

      if (filters?.businessType) {
        query = query.eq('business_type', filters.businessType);
      }

      if (filters?.categoryId) {
        query = query.eq('category_id', filters.categoryId);
      }

      if (filters?.merchantDomain) {
        query = query.eq('merchant_domain', filters.merchantDomain);
      }

      if (filters?.priceRange) {
        query = query.gte('price', filters.priceRange.min).lte('price', filters.priceRange.max);
      }

      if (tagFilteredIds) {
        query = query.in('id', tagFilteredIds);
      }

      if (filters?.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,business_name.ilike.%${filters.search}%`,
        );
      }

      query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const [listingsResult, brokenResult] = await Promise.all([
        queryWithRetry(() => query) as Promise<{ data: unknown[]; count: number | null; error: Error | null }>,
        supabase.rpc('get_broken_marketplace_ids'),
      ]);

      if (listingsResult.error) throw listingsResult.error;

      const brokenIds = new Set<string>((brokenResult.data ?? []).map((id: string) => id));

      const rawData = (listingsResult.data || []) as MarketplaceListing[];
      const filtered = rawData.filter(
        (l: MarketplaceListing) => !brokenIds.has(l.id),
      );
      setListings(filtered);
      setTotal(listingsResult.count ?? filtered.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch listings');
    } finally {
      setLoading(false);
    }
  };

  const createListing = async (listing: MarketplaceListingInsert) => {
    try {
      const { data, error } = await supabase
        .from('marketplace_listings')
        .insert([listing])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Failed to create listing',
      };
    }
  };

  const toggleFavorite = async (listingId: string) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Must be logged in to favorite items');

      const { data: existing } = await supabase
        .from('marketplace_favorites')
        .select('id')
        .eq('listing_id', listingId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('marketplace_favorites')
          .delete()
          .eq('listing_id', listingId)
          .eq('user_id', user.id);
        if (error) throw error;
        return { favorited: false, error: null };
      } else {
        const { error } = await supabase
          .from('marketplace_favorites')
          .insert({ listing_id: listingId, user_id: user.id });
        if (error) throw error;
        return { favorited: true, error: null };
      }
    } catch (err) {
      return {
        favorited: false,
        error: err instanceof Error ? err.message : 'Failed to toggle favorite',
      };
    }
  };

  const incrementViews = async (listingId: string) => {
    try {
      const { error } = await supabase.rpc('increment_listing_views', {
        listing_id: listingId,
      });
      if (error) console.warn('Failed to increment views:', error);
    } catch (err) {
      console.warn('Failed to increment views:', err);
    }
  };

  return {
    listings,
    total,
    pageSize: PAGE_SIZE,
    loading,
    loadingTimedOut,
    error,
    fetchListings,
    createListing,
    toggleFavorite,
    incrementViews,
    refetch: () => fetchListings(),
  };
}
