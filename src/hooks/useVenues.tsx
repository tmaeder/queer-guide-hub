import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];
type VenueInsert = Database['public']['Tables']['venues']['Insert'];

export function useVenues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVenues = async (filters?: {
    city?: string;
    category?: string;
    tags?: string[];
    amenities?: string[];
    search?: string;
  }) => {
    try {
      setLoading(true);
      let query = supabase
        .from('venues')
        .select(`
          *,
          venue_reviews(rating)
        `)
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

      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setVenues(data || []);
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
    fetchVenues();
  }, []);

  return {
    venues,
    loading,
    error,
    fetchVenues,
    createVenue,
    updateVenue,
    deleteVenue,
    refetch: () => fetchVenues(),
  };
}