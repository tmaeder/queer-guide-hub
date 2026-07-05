import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { queryWithRetry } from '@/utils/fetchWithRetry';
import { searchFetch } from '@/lib/searchFetch';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
type MarketplaceListingInsert = Database['public']['Tables']['marketplace_listings']['Insert'];

export const PAGE_SIZE = 24;

export type MarketplaceSort =
  | 'boutique'
  | 'for_you'
  | 'most_loved'
  | 'best_value'
  | 'editor_choice'
  | 'newest'
  | 'price_asc'
  | 'price_desc';

export interface MarketplaceFiltersInput {
  category?: string;
  /** browse umbrella (apparel, underwear, intimacy, …) — generated `department` column. */
  department?: string;
  subcategory?: string;
  /** canonical fine bucket (tops, dildos, harnesses, …) — generated `subcategory_group` column. */
  subcategoryGroup?: string;
  location?: string;
  priceRange?: { min: number; max: number };
  tags?: string[];
  search?: string;
  businessType?: string;
  categoryId?: string;
  merchantDomain?: string;
  /** normalized brand key (generated brand_key column) — brand pages. */
  brandKey?: string;
  /** snake_case slugs: queer_owned, trans_owned, bipoc_owned, women_owned, … */
  communityOwned?: string[];
  /** ISO-4217 currency code. */
  currency?: string;
  /** When 'in_stock', hides listings where availability !== 'in_stock'. */
  availability?: 'in_stock' | 'any';
  /** last_verified_at within N days. Skipped when null/undefined or 0. */
  verifiedWithinDays?: number;
  /**
   * When false/undefined, browse is default-SFW: only content_rating in
   * ('sfw','suggestive') is returned. Set true (after a 18+ opt-in) to also
   * include 'adult' / 'explicit' listings.
   */
  includeAdult?: boolean;
}

// Browse-safe ratings shown without the adult opt-in. Mirrors the
// content_rating tiers derived in migration 20260608210000.
export const SFW_RATINGS = ['sfw', 'suggestive'];

export function useMarketplace() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  const fetchListings = async (
    filters?: MarketplaceFiltersInput,
    page = 0,
    sort: MarketplaceSort = 'boutique',
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
          let rowsQuery = supabase
            .from('marketplace_listings')
            .select(
              `*, marketplace_reviews(rating), marketplace_favorites(id), venues(name, address, city)`,
            )
            .eq('status', 'active')
            .in('id', constrainedIds);
          if (!filters?.includeAdult) {
            rowsQuery = rowsQuery.in('content_rating', SFW_RATINGS);
          }
          const { data: rows, error: rowsErr } = await rowsQuery;
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

      // Default 'boutique' ranks by the boutique_score generated column
      // (relevance + quality + queer-ownership + non-aggregator + brand).
      // Every sort feature-pins first so editorially chosen items lead.
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
          query = query
            .order('featured', { ascending: false })
            .order('views_count', { ascending: false, nullsFirst: false })
            .order('quality_score', { ascending: false, nullsFirst: false })
            .order('lgbti_relevance_score', { ascending: false, nullsFirst: false });
          break;
        case 'boutique':
        default:
          query = query
            .order('featured', { ascending: false })
            .order('boutique_score', { ascending: false, nullsFirst: false });
          break;
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.department) {
        query = query.eq('department', filters.department);
      }

      if (filters?.subcategoryGroup) {
        query = query.eq('subcategory_group', filters.subcategoryGroup);
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

      if (filters?.brandKey) {
        query = query.eq('brand_key', filters.brandKey);
      }

      if (filters?.priceRange) {
        query = query.gte('price', filters.priceRange.min).lte('price', filters.priceRange.max);
      }

      if (tagFilteredIds) {
        query = query.in('id', tagFilteredIds);
      }

      if (filters?.communityOwned && filters.communityOwned.length > 0) {
        query = query.overlaps('community_owned_tags', filters.communityOwned);
      }

      // Default-SFW browse: hide adult/explicit unless the visitor opted in (18+).
      if (!filters?.includeAdult) {
        query = query.in('content_rating', SFW_RATINGS);
      }

      if (filters?.currency) {
        query = query.eq('currency', filters.currency);
      }

      // Default behaviour: include only listings explicitly in stock. The
      // ingestion pipeline writes 'in_stock' / 'out_of_stock' / 'limited'
      // / null; only the explicit out-of-stock should be hidden so legacy
      // null-availability listings stay visible.
      if (filters?.availability === 'in_stock') {
        query = query.or('availability.is.null,availability.neq.out_of_stock');
      }

      if (filters?.verifiedWithinDays && filters.verifiedWithinDays > 0) {
        const since = new Date(Date.now() - filters.verifiedWithinDays * 86_400_000).toISOString();
        query = query.gte('last_verified_at', since);
      }

      if (filters?.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,business_name.ilike.%${filters.search}%`,
        );
      }

      query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      // Broken listings are demoted to status='inactive' server-side by the
      // marketplace-link-checker; get_broken_marketplace_ids is admin-only
      // since the 20260527 linter cleanup, so no client-side filter here.
      const listingsResult = (await queryWithRetry(() => query)) as {
        data: unknown[];
        count: number | null;
        error: Error | null;
      };

      if (listingsResult.error) throw listingsResult.error;

      const rawData = (listingsResult.data || []) as MarketplaceListing[];
      setListings(rawData);
      setTotal(listingsResult.count ?? rawData.length);
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
