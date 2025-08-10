import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];
type VenueInsert = Database['public']['Tables']['venues']['Insert'];

export function useVenues(autoFetch: boolean = true) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchVenues = async (
    filters?: {
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
    },
    options?: { page?: number; pageSize?: number; append?: boolean }
  ) => {
    try {
      setLoading(true);
      const page = options?.page;
      const pageSize = options?.pageSize ?? 24;

      let query = supabase
        .from('venues')
        .select('*', { count: 'exact' })
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.city) {
        query = query.ilike('city', `%${filters.city}%`);
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      if (filters?.amenities && filters.amenities.length > 0) {
        query = query.overlaps('amenities', filters.amenities);
      }

      if (filters?.services && filters.services.length > 0) {
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

      if (typeof page === 'number') {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await query;

      if (error) throw error;
      
      let processedVenues = data || [];

      // If nearMe filter is active and user location is available, sort by distance
      if (filters?.nearMe && filters?.userLocation) {
        const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
          const R = 6371; // Radius of the Earth in kilometers
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c; // Distance in kilometers
          return distance;
        };

        // Filter venues that have latitude and longitude and calculate distances
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
          .filter((venue: any) => venue.distance <= 50) // Within 50km
          .sort((a: any, b: any) => a.distance - b.distance); // Sort by distance
      }

      if (options?.append) {
        setVenues(prev => [...prev, ...processedVenues]);
      } else {
        setVenues(processedVenues);
      }

      if (typeof count === 'number') {
        if (typeof page === 'number') {
          const from = (page - 1) * pageSize;
          setHasMore(from + processedVenues.length < count);
        } else {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch venues');
    } finally {
      setLoading(false);
    }
  };

  const createVenue = async (venue: VenueInsert) => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .insert([venue])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to create venue' 
      };
    }
  };

  const updateVenue = async (id: string, venue: Partial<VenueInsert>) => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .update(venue)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to update venue' 
      };
    }
  };

  const deleteVenue = async (id: string) => {
    try {
      const { error } = await supabase
        .from('venues')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { error: null };
    } catch (err) {
      return { 
        error: err instanceof Error ? err.message : 'Failed to delete venue' 
      };
    }
  };

  useEffect(() => {
    if (autoFetch) {
      fetchVenues();
    }
  }, [autoFetch]);

  return {
    venues,
    loading,
    error,
    hasMore,
    fetchVenues,
    createVenue,
    updateVenue,
    deleteVenue,
    refetch: () => fetchVenues(),
  };
}