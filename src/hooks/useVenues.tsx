import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { Database } from '@/types/database';
import { calculateDistanceKm } from '@/utils/calculateDistance';
import { queryWithRetry } from '@/utils/fetchWithRetry';

type Venue = Database['public']['Tables']['venues']['Row'];
type VenueInsert = Database['public']['Tables']['venues']['Insert'];

type VenueFilters = {
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
};

type FetchOptions = { page?: number; pageSize?: number; append?: boolean };

async function fetchVenuesQuery(
  filters?: VenueFilters,
  options?: FetchOptions,
): Promise<{ data: Venue[]; count: number | null }> {
  const pageSize = options?.pageSize ?? 24;

  let query = api
    .from('venues')
    .select('*', { count: 'exact' })
    .neq('data_source', 'refuge_restrooms')
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
  if (typeof filters?.limit === 'number') {
    query = query.limit(filters.limit);
  }
  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,address.ilike.%${filters.search}%`,
    );
  }
  if (typeof options?.page === 'number') {
    const from = (options.page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = (await queryWithRetry(() => query)) as any;
  if (error) throw error;

  let processedVenues = data || [];

  if (filters?.nearMe && filters?.userLocation) {
    processedVenues = processedVenues
      .filter((venue: any) => venue.latitude && venue.longitude)
      .map((venue: any) => ({
        ...venue,
        distance: calculateDistanceKm(
          filters.userLocation!.latitude,
          filters.userLocation!.longitude,
          Number(venue.latitude),
          Number(venue.longitude),
        ),
      }))
      .filter((venue: any) => venue.distance <= 50)
      .sort((a: any, b: any) => a.distance - b.distance);
  }

  return { data: processedVenues, count: typeof count === 'number' ? count : null };
}

export function useVenues(autoFetch: boolean = true) {
  const queryClient = useQueryClient();
  const [currentFilters, setCurrentFilters] = useState<VenueFilters | undefined>(undefined);
  const [currentOptions, setCurrentOptions] = useState<FetchOptions | undefined>(undefined);
  const [appendedVenues, setAppendedVenues] = useState<Venue[]>([]);
  const isAppending = useRef(false);

  const queryKey = ['venues', currentFilters, currentOptions] as const;

  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
  } = useQuery({
    queryKey,
    queryFn: () => fetchVenuesQuery(currentFilters, currentOptions),
    enabled: autoFetch || currentFilters !== undefined,
    staleTime: 30_000,
  });

  // Handle append mode: merge new results with accumulated venues
  useEffect(() => {
    if (!data) return;
    if (isAppending.current) {
      setAppendedVenues((prev) => {
        const merged = [...prev, ...data.data];
        return Array.from(new Map(merged.map((v) => [v.id, v])).values());
      });
      isAppending.current = false;
    } else {
      setAppendedVenues(data.data);
    }
  }, [data]);

  const venues = appendedVenues;
  const loading = isLoading;
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!isFetching) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [isFetching]);

  const hasMore = (() => {
    if (!data || data.count === null) return false;
    const page = currentOptions?.page;
    const pageSize = currentOptions?.pageSize ?? 24;
    if (typeof page === 'number') {
      const from = (page - 1) * pageSize;
      return from + data.data.length < data.count;
    }
    return false;
  })();

  const fetchVenues = useCallback(
    async (filters?: VenueFilters, options?: FetchOptions) => {
      if (options?.append) {
        isAppending.current = true;
      }
      setCurrentFilters(filters);
      setCurrentOptions(options);

      // Eagerly fetch and return result for callers that await
      try {
        const result = await queryClient.fetchQuery({
          queryKey: ['venues', filters, options],
          queryFn: () => fetchVenuesQuery(filters, options),
          staleTime: 30_000,
        });
        return { fetched: result.data.length, total: result.count };
      } catch {
        return { fetched: 0, total: null };
      }
    },
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: async (venue: VenueInsert) => {
      const { data, error } = await api.from('venues').insert([venue]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues'] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, venue }: { id: string; venue: Partial<VenueInsert> }) => {
      const { data, error } = await api.from('venues').update(venue).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.from('venues').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues'] }),
  });

  const createVenue = useCallback(
    async (venue: VenueInsert) => {
      try {
        const data = await createMutation.mutateAsync(venue);
        return { data, error: null };
      } catch (err) {
        return {
          data: null,
          error: err instanceof Error ? err.message : 'Failed to create venue',
        };
      }
    },
    [createMutation],
  );

  const updateVenue = useCallback(
    async (id: string, venue: Partial<VenueInsert>) => {
      try {
        const data = await updateMutation.mutateAsync({ id, venue });
        return { data, error: null };
      } catch (err) {
        return {
          data: null,
          error: err instanceof Error ? err.message : 'Failed to update venue',
        };
      }
    },
    [updateMutation],
  );

  const deleteVenue = useCallback(
    async (id: string) => {
      try {
        await deleteMutation.mutateAsync(id);
        return { error: null };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Failed to delete venue',
        };
      }
    },
    [deleteMutation],
  );

  return {
    venues,
    loading,
    isFetching,
    loadingTimedOut,
    error: queryError
      ? queryError instanceof Error
        ? queryError.message
        : String(queryError)
      : null,
    hasMore,
    fetchVenues,
    createVenue,
    updateVenue,
    deleteVenue,
    refetch: () => fetchVenues(currentFilters, currentOptions),
  };
}
