import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];
type VenueInsert = Database['public']['Tables']['venues']['Insert'];

interface VenueFilters {
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
  limit?: number;
  offset?: number;
}

const VENUES_QUERY_KEY = 'venues';
const CACHE_TIME = 5 * 60 * 1000; // 5 minutes
const STALE_TIME = 2 * 60 * 1000; // 2 minutes

export function useOptimizedVenues(filters?: VenueFilters) {
  const queryClient = useQueryClient();

  const buildQuery = (filters?: VenueFilters) => {
    let query = supabase
      .from('venues')
      .select(`
        id,name,description,address,city,state,country,
        latitude,longitude,phone,website,email,
        category,tags,amenities,services,accessibility_attributes,
        target_groups,featured,is_active,created_at,updated_at
      `)
      .eq('is_active', true)
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

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    return query;
  };

  const fetchVenues = async (): Promise<Venue[]> => {
    const { data, error } = await buildQuery(filters);

    if (error) throw error;
    
    let processedVenues = data || [];

    // Client-side distance filtering for nearMe
    if (filters?.nearMe && filters?.userLocation) {
      const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371; // Radius of Earth in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      };

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

    return processedVenues;
  };

  const {
    data: venues = [],
    isLoading,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: [VENUES_QUERY_KEY, filters],
    queryFn: fetchVenues,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const createVenueMutation = useMutation({
    mutationFn: async (venue: VenueInsert): Promise<Venue> => {
      const { data, error } = await supabase
        .from('venues')
        .insert([venue])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [VENUES_QUERY_KEY] });
    },
  });

  const updateVenueMutation = useMutation({
    mutationFn: async ({ id, venue }: { id: string; venue: Partial<VenueInsert> }): Promise<Venue> => {
      const { data, error } = await supabase
        .from('venues')
        .update(venue)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [VENUES_QUERY_KEY] });
    },
  });

  const deleteVenueMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('venues')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [VENUES_QUERY_KEY] });
    },
  });

  return {
    venues,
    loading: isLoading,
    error: error?.message || null,
    isFetching,
    refetch,
    createVenue: createVenueMutation.mutate,
    updateVenue: updateVenueMutation.mutate,
    deleteVenue: deleteVenueMutation.mutate,
    isCreating: createVenueMutation.isPending,
    isUpdating: updateVenueMutation.isPending,
    isDeleting: deleteVenueMutation.isPending,
  };
}