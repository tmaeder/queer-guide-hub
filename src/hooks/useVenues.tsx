import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { calculateDistanceKm } from '@/utils/calculateDistance';
import { queryWithRetry } from '@/utils/fetchWithRetry';

type Venue = Database['public']['Tables']['venues']['Row'];
type VenueInsert = Database['public']['Tables']['venues']['Insert'];

export function useVenues(autoFetch: boolean = true) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [datasetTotal, setDatasetTotal] = useState<number | null>(null);
  const [filteredTotal, setFilteredTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('venues')
        .select('id', { head: true, count: 'exact' })
        .neq('data_source', 'refuge-restrooms')
        .is('duplicate_of_id', null);
      if (!cancelled) setDatasetTotal(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

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
      bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
      limit?: number;
      radiusKm?: number;
      openNow?: boolean;
      priceLevel?: number;
    },
    options?: {
      page?: number;
      pageSize?: number;
      append?: boolean;
      sort?: string;
      useRanking?: boolean;
      userId?: string | null;
    },
  ) => {
    let fetchedCount = 0;
    let totalCount: number | null = null;
    try {
      setLoading(true);
      setLoadingTimedOut(false);
      const page = options?.page;
      const pageSize = options?.pageSize ?? 24;

      // New ranked path via rpc_venues_ranked. Used when caller opts in.
      // Falls back to the legacy PostgREST query on RPC error.
      if (options?.useRanking) {
        try {
          const rpcFilters: Record<string, unknown> = {};
          if (filters?.search) rpcFilters.search = filters.search;
          if (filters?.category) rpcFilters.category = filters.category;
          if (filters?.city) rpcFilters.city = filters.city;
          if (filters?.tags?.length) rpcFilters.tags = filters.tags;
          if (filters?.amenities?.length) rpcFilters.amenities = filters.amenities;
          if (filters?.services?.length) rpcFilters.services = filters.services;
          if (filters?.accessibilityAttributes?.length)
            rpcFilters.accessibility = filters.accessibilityAttributes;
          if (filters?.targetGroups?.length) rpcFilters.groups = filters.targetGroups;
          if (typeof filters?.radiusKm === 'number') rpcFilters.radiusKm = filters.radiusKm;
          if (filters?.openNow) rpcFilters.openNow = true;
          if (typeof filters?.priceLevel === 'number') rpcFilters.priceLevel = filters.priceLevel;

          const offset =
            typeof page === 'number' ? (page - 1) * pageSize : 0;

          const { data, error: rpcErr } = (await queryWithRetry(() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any).rpc('rpc_venues_ranked', {
              p_user_id: options.userId ?? null,
              p_lat: filters?.userLocation?.latitude ?? null,
              p_lng: filters?.userLocation?.longitude ?? null,
              p_filters: rpcFilters,
              p_sort: options.sort ?? 'relevance',
              p_limit: pageSize,
              p_offset: offset,
            }),
          )) as { data: Array<{ venue: Venue; score: number; distance_m: number | null; total_count: number }> | null; error: Error | null };

          if (rpcErr) throw rpcErr;
          const rows = data ?? [];
          const processed = rows.map((r) => ({
            ...(r.venue as Venue),
            distance: r.distance_m != null ? r.distance_m / 1000 : undefined,
            relevance_score: r.score,
          })) as Venue[];

          if (options.append) {
            setVenues((prev) => {
              const merged = [...prev, ...processed];
              return Array.from(new Map(merged.map((v) => [v.id, v])).values());
            });
          } else {
            setVenues(processed);
          }
          fetchedCount = processed.length;
          totalCount = rows[0]?.total_count ?? processed.length;
          setFilteredTotal(totalCount);
          setHasMore(offset + processed.length < (totalCount ?? 0));
          return { fetched: fetchedCount, total: totalCount };
        } catch (rpcErr) {
          // Fall through to legacy path if RPC is unavailable.
          // eslint-disable-next-line no-console
          console.warn('[useVenues] rpc_venues_ranked failed, falling back', rpcErr);
        }
      }

      let query = supabase
        .from('venues')
        .select('*', { count: 'exact' })
        .neq('data_source', 'refuge-restrooms')
        .is('duplicate_of_id', null);

      // Server-side sort
      const sort = options?.sort ?? 'featured';
      switch (sort) {
        case 'name':
          query = query.order('name', { ascending: true });
          break;
        case 'category':
          query = query.order('category', { ascending: true }).order('name', { ascending: true });
          break;
        case 'city':
          query = query.order('city', { ascending: true }).order('name', { ascending: true });
          break;
        case 'created_at':
          query = query.order('created_at', { ascending: false });
          break;
        case 'featured':
        default:
          query = query
            .order('is_featured', { ascending: false })
            .order('created_at', { ascending: false });
          break;
      }

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

      // Geographic bounds filtering (for map viewport)
      if (filters?.bounds) {
        query = query
          .gte('latitude', filters.bounds.minLat)
          .lte('latitude', filters.bounds.maxLat)
          .gte('longitude', filters.bounds.minLng)
          .lte('longitude', filters.bounds.maxLng);
      }

      if (typeof filters?.limit === 'number') {
        query = query.limit(filters.limit);
      }

      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,address.ilike.%${filters.search}%`,
        );
      }

      if (typeof page === 'number') {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = (await queryWithRetry(() => query)) as { data: Record<string, unknown>[] | null; error: Error | null; count: number | null };

      if (error) throw error;

      let processedVenues = data || [];

      // If nearMe filter is active and user location is available, sort by distance
      if (filters?.nearMe && filters?.userLocation) {
        // Filter venues that have latitude and longitude and calculate distances
        processedVenues = processedVenues
          .filter((venue) => venue.latitude && venue.longitude)
          .map((venue) => ({
            ...venue,
            distance: calculateDistanceKm(
              filters.userLocation!.latitude,
              filters.userLocation!.longitude,
              Number(venue.latitude),
              Number(venue.longitude),
            ),
          }))
          .filter((venue: { distance: number }) => venue.distance <= 50) // Within 50km
          .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance); // Sort by distance
      }

      if (options?.append) {
        setVenues((prev) => {
          const merged = [...prev, ...processedVenues];
          return Array.from(new Map(merged.map((v) => [v.id, v])).values());
        });
      } else {
        setVenues(processedVenues);
      }

      // Track fetched and total counts for callers
      fetchedCount = processedVenues.length;
      totalCount = typeof count === 'number' ? count : null;
      setFilteredTotal(totalCount);

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
    return { fetched: fetchedCount, total: totalCount };
  };

  const createVenue = async (venue: VenueInsert) => {
    try {
      const { data, error } = await supabase.from('venues').insert([venue]).select().single();

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Failed to create venue',
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
        error: err instanceof Error ? err.message : 'Failed to update venue',
      };
    }
  };

  const deleteVenue = async (id: string) => {
    try {
      const { error } = await supabase.from('venues').delete().eq('id', id);

      if (error) throw error;
      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Failed to delete venue',
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
    isFetching: loading,
    loadingTimedOut,
    error,
    hasMore,
    datasetTotal,
    filteredTotal,
    fetchVenues,
    createVenue,
    updateVenue,
    deleteVenue,
    refetch: () => fetchVenues(),
  };
}
