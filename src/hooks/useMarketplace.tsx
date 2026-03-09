import { useState, useEffect } from 'react';
import { api } from '@/integrations/api/client';
import { Database } from '@/types/database';
import { queryWithRetry } from '@/utils/fetchWithRetry';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
type MarketplaceListingInsert = Database['public']['Tables']['marketplace_listings']['Insert'];

export function useMarketplace() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchListings = async (filters?: {
    category?: string;
    subcategory?: string;
    location?: string;
    priceRange?: { min: number; max: number };
    tags?: string[];
    search?: string;
    businessType?: string;
  }) => {
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
        )
        .eq('status', 'active')
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false });

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

      query = query.limit(100);

      // Fetch listings and broken IDs in parallel
      const [listingsResult, brokenResult] = await Promise.all([
        queryWithRetry(() => query) as any,
        api.rpc('get_broken_marketplace_ids'),
      ]);

      if (listingsResult.error) throw listingsResult.error;

      const brokenIds = new Set<string>((brokenResult.data ?? []).map((id: string) => id));

      // Filter out listings with broken website links
      const filtered = (listingsResult.data || []).filter(
        (l: MarketplaceListing) => !brokenIds.has(l.id),
      );
      setListings(filtered);
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
      const user = (await api.auth.getUser()).data.user;
      if (!user) throw new Error('Must be logged in to favorite items');

      const { data: existing } = await supabase
        .from('marketplace_favorites')
        .select('id')
        .eq('listing_id', listingId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Remove favorite
        const { error } = await supabase
          .from('marketplace_favorites')
          .delete()
          .eq('listing_id', listingId)
          .eq('user_id', user.id);
        if (error) throw error;
        return { favorited: false, error: null };
      } else {
        // Add favorite
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
      const { error } = await api.rpc('increment_listing_views', {
        listing_id: listingId,
      });
      if (error) console.warn('Failed to increment views:', error);
    } catch (err) {
      console.warn('Failed to increment views:', err);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  return {
    listings,
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
