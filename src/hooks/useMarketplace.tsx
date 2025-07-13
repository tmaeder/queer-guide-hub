import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
type MarketplaceListingInsert = Database['public']['Tables']['marketplace_listings']['Insert'];

export function useMarketplace() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      let query = supabase
        .from('marketplace_listings')
        .select(`
          *,
          marketplace_reviews(rating),
          marketplace_favorites(id)
        `)
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
        query = query
          .gte('price', filters.priceRange.min)
          .lte('price', filters.priceRange.max);
      }

      if (filters?.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,business_name.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setListings(data || []);
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
        error: err instanceof Error ? err.message : 'Failed to create listing' 
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
        error: err instanceof Error ? err.message : 'Failed to toggle favorite' 
      };
    }
  };

  const incrementViews = async (listingId: string) => {
    try {
      const { error } = await (supabase as any).rpc('increment_listing_views', { listing_id: listingId });
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
    error,
    fetchListings,
    createListing,
    toggleFavorite,
    incrementViews,
    refetch: () => fetchListings(),
  };
}