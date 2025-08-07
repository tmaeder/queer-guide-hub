import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];
type VenueInsert = Database['public']['Tables']['venues']['Insert'];

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

class VenueCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  set<T>(key: string, data: T, ttl = this.DEFAULT_TTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry: ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clear() {
    this.cache.clear();
  }

  invalidatePattern(pattern: string) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

const venueCache = new VenueCache();

export function useOptimizedVenues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedFetch = useCallback(
    debounce(async (filters?: {
      city?: string;
      category?: string;
      tags?: string[];
      amenities?: string[];
      services?: string[];
      accessibilityAttributes?: string[];
      targetGroups?: string[];
      search?: string;
      userLocation?: { latitude: number; longitude: number };
      nearMe?: boolean;
    }) => {
      const cacheKey = `venues_${JSON.stringify(filters || {})}`;
      const cached = venueCache.get<Venue[]>(cacheKey);
      
      if (cached) {
        setVenues(cached);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Optimize query by selecting only needed fields
        let query = supabase
          .from('venues')
          .select('*')
          .order('featured', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100); // Limit initial results

        // Apply filters efficiently
        if (filters?.city) {
          query = query.ilike('city', `%${filters.city}%`);
        }
        if (filters?.category) {
          query = query.eq('category', filters.category);
        }
        if (filters?.tags?.length) {
          query = query.overlaps('tags', filters.tags);
        }
        if (filters?.amenities?.length) {
          query = query.overlaps('amenities', filters.amenities);
        }
        if (filters?.services?.length) {
          query = query.overlaps('services', filters.services);
        }
        if (filters?.accessibilityAttributes?.length) {
          query = query.overlaps('accessibility_attributes', filters.accessibilityAttributes);
        }
        if (filters?.targetGroups?.length) {
          query = query.overlaps('target_groups', filters.targetGroups);
        }
        if (filters?.search) {
          query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,address.ilike.%${filters.search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;
        
        let processedVenues = data || [];

        // Client-side distance filtering (only if needed)
        if (filters?.nearMe && filters?.userLocation) {
          processedVenues = processedVenues
            .filter(venue => venue.latitude && venue.longitude)
            .map(venue => ({
              ...venue,
              distance: calculateDistance(
                filters.userLocation!.latitude,
                filters.userLocation!.longitude,
                Number(venue.latitude),
                Number(venue.longitude)
              )
            }))
            .filter((venue: any) => venue.distance <= 50)
            .sort((a: any, b: any) => a.distance - b.distance);
        }

        // Cache the results
        venueCache.set(cacheKey, processedVenues);
        setVenues(processedVenues);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch venues');
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  const fetchVenues = useCallback((filters?: any) => {
    debouncedFetch(filters);
  }, [debouncedFetch]);

  const createVenue = useCallback(async (venue: VenueInsert) => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .insert([venue])
        .select()
        .single();

      if (error) throw error;
      
      // Invalidate cache
      venueCache.invalidatePattern('venues_');
      
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to create venue' 
      };
    }
  }, []);

  const updateVenue = useCallback(async (id: string, venue: Partial<VenueInsert>) => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .update(venue)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      // Invalidate cache
      venueCache.invalidatePattern('venues_');
      
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to update venue' 
      };
    }
  }, []);

  const deleteVenue = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('venues')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      // Invalidate cache
      venueCache.invalidatePattern('venues_');
      
      return { error: null };
    } catch (err) {
      return { 
        error: err instanceof Error ? err.message : 'Failed to delete venue' 
      };
    }
  }, []);

  // Memoized derived data
  const venuesByCategory = useMemo(() => {
    return venues.reduce((acc, venue) => {
      if (!acc[venue.category || 'uncategorized']) {
        acc[venue.category || 'uncategorized'] = [];
      }
      acc[venue.category || 'uncategorized'].push(venue);
      return acc;
    }, {} as Record<string, Venue[]>);
  }, [venues]);

  const venuesByCity = useMemo(() => {
    return venues.reduce((acc, venue) => {
      if (!acc[venue.city]) acc[venue.city] = [];
      acc[venue.city].push(venue);
      return acc;
    }, {} as Record<string, Venue[]>);
  }, [venues]);

  const featuredVenues = useMemo(() => {
    return venues.filter(venue => venue.featured).slice(0, 20);
  }, [venues]);

  const topRatedVenues = useMemo(() => {
    return venues
      .filter(venue => venue.featured) // Use featured instead of rating
      .slice(0, 20);
  }, [venues]);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  return {
    venues,
    loading,
    error,
    fetchVenues,
    createVenue,
    updateVenue,
    deleteVenue,
    refetch: () => fetchVenues(),
    // Derived data
    venuesByCategory,
    venuesByCity,
    featuredVenues,
    topRatedVenues,
    // Cache management
    clearCache: () => venueCache.clear()
  };
}

// Utility functions
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(null, args), wait);
  };
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}