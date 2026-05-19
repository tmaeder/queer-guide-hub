import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { queryWithRetry } from '@/utils/fetchWithRetry';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
type MarketplaceListingInsert = Database['public']['Tables']['marketplace_listings']['Insert'];

export const PAGE_SIZE = 24;

export type MarketplaceSort = 'relevance' | 'newest' | 'oldest' | 'az' | 'za' | 'price_asc' | 'price_desc' | 'most_viewed';

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
    sort: MarketplaceSort = 'relevance',
  ) => {
    try {
      setLoading(true);
      setLoadingTimedOut(false);
      setError(null);
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
        .eq('status', 'active')
        .order('featured', { ascending: false });

      switch (sort) {
        case 'oldest':
          query = query.order('created_at', { ascending: true });
          break;
        case 'az':
          query = query.order('title', { ascending: true });
          break;
        case 'za':
          query = query.order('title', { ascending: false });
          break;
        case 'price_asc':
          query = query.order('price_usd', { ascending: true, nullsFirst: false });
          break;
        case 'price_desc':
          query = query.order('price_usd', { ascending: false, nullsFirst: false });
          break;
        case 'most_viewed':
          query = query.order('views_count', { ascending: false, nullsFirst: false });
          break;
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
        case 'relevance':
        default:
          query = query
            .order('quality_score', { ascending: false, nullsFirst: false })
            .order('lgbti_relevance_score', { ascending: false, nullsFirst: false })
            .order('updated_at', { ascending: false });
          break;
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.subcategory) {
        query = query.eq('subcategory', filters.subcategory);
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

      if (filters?.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
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
