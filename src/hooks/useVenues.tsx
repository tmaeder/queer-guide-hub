import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { hashKey, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';
import type { Database } from '@/integrations/supabase/types';
import { calculateDistanceKm } from '@/utils/calculateDistance';
import { queryWithRetry } from '@/utils/fetchWithRetry';

type Venue = Database['public']['Tables']['venues']['Row'];

export type VenueFilters = {
  city?: string;
  cityId?: string;
  countryId?: string;
  /** venues.queer_village_id — the venues actually inside a queer village. */
  queerVillageId?: string;
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
  /**
   * Quality gate for public teaser rails (city/country/village pages):
   * drops uncategorized scrape noise (category='other' with no LGBTQ+
   * relevance signal) without touching the full browse catalog.
   * NOTE: relevance alone is not a safe gate — the classifier has false
   * negatives on iconic venues (e.g. Tom's Bar at 0.00), so category
   * membership keeps those in.
   */
  railQuality?: boolean;
};

export interface VenuesPageOptions {
  /** 1-based. Omit for an unpaged query (capped by `filters.limit`). */
  page?: number;
  pageSize?: number;
  sort?: string;
  /** Route through rpc_venues_ranked (falls back to the direct query on error). */
  useRanking?: boolean;
  userId?: string | null;
  signal?: AbortSignal;
}

/**
 * One venues query, with no React state: the ranked RPC (with its fallback to
 * the direct query), server-side sort and filters, and the nearMe distance
 * filter. `useVenuesQuery` and `useVenuesFeed` both run through it.
 */
export async function fetchVenuesPage(
  filters: VenueFilters | undefined,
  options: VenuesPageOptions = {},
): Promise<{ venues: Venue[]; count: number | null }> {
  const { signal } = options;
  const page = options.page;
  const pageSize = options.pageSize ?? 24;

  // New ranked path via rpc_venues_ranked. Used when caller opts in.
  // Falls back to the legacy PostgREST query on RPC error.
  // rpc_venues_ranked has no queer_village_id argument. Routing such a
  // call down the direct PostgREST path is deliberate: the alternative is
  // accepting the filter and silently ignoring it, which is how the village
  // page ended up listing city-wide venues in the first place.
  if (options.useRanking && !filters?.queerVillageId) {
    try {
      const rpcFilters: Record<string, unknown> = {};
      if (filters?.search) rpcFilters.search = filters.search;
      if (filters?.category) rpcFilters.category = filters.category;
      if (filters?.city) rpcFilters.city = filters.city;
      if (filters?.cityId) rpcFilters.cityId = filters.cityId;
      if (filters?.countryId) rpcFilters.countryId = filters.countryId;
      if (filters?.tags?.length) rpcFilters.tags = filters.tags;
      if (filters?.amenities?.length) rpcFilters.amenities = filters.amenities;
      if (filters?.services?.length) rpcFilters.services = filters.services;
      if (filters?.accessibilityAttributes?.length)
        rpcFilters.accessibility = filters.accessibilityAttributes;
      if (filters?.targetGroups?.length) rpcFilters.groups = filters.targetGroups;
      if (typeof filters?.radiusKm === 'number') rpcFilters.radiusKm = filters.radiusKm;
      if (filters?.openNow) rpcFilters.openNow = true;
      if (typeof filters?.priceLevel === 'number') rpcFilters.priceLevel = filters.priceLevel;

      const offset = typeof page === 'number' ? (page - 1) * pageSize : 0;

      const { data, error: rpcErr } = await queryWithRetry(() =>
        untypedRpc<
          Array<{ venue: Venue; score: number; distance_m: number | null; total_count: number }>
        >('rpc_venues_ranked', {
          p_user_id: options.userId ?? null,
          p_lat: filters?.userLocation?.latitude ?? null,
          p_lng: filters?.userLocation?.longitude ?? null,
          p_filters: rpcFilters,
          p_sort: options.sort ?? 'relevance',
          p_limit: pageSize,
          p_offset: offset,
        }),
      );

      if (rpcErr) throw rpcErr;
      const rows = data ?? [];
      const processed = rows.map((r) => ({
        ...(r.venue as Venue),
        distance: r.distance_m != null ? r.distance_m / 1000 : undefined,
        relevance_score: r.score,
      })) as Venue[];

      return { venues: processed, count: rows[0]?.total_count ?? processed.length };
    } catch (rpcErr) {
      // Fall through to legacy path if RPC is unavailable.

      console.warn('[useVenues] rpc_venues_ranked failed, falling back', rpcErr);
    }
  }

  let query = supabase
    .from('venues')
    .select('*', { count: 'exact' })
    .neq('data_source', 'refuge-restrooms')
    .neq('review_status', 'archived')
    .is('duplicate_of_id', null)
    .is('closed_at', null);

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

  if (filters?.railQuality) {
    query = query.or('category.neq.other,lgbti_relevance_score.gte.0.5');
  }

  if (filters?.countryId) {
    query = query.eq('country_id', filters.countryId);
  }

  if (filters?.queerVillageId) {
    query = query.eq('queer_village_id', filters.queerVillageId);
  }

  if (filters?.cityId) {
    // A direct-query fallback must fail closed to the stable FK. The ranked
    // RPC owns the only legacy text fallback and requires country evidence.
    query = query.eq('city_id', filters.cityId);
  } else if (filters?.city) {
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

  const { data, error, count } = (await queryWithRetry(() =>
    signal ? query.abortSignal(signal) : query,
  )) as {
    data: Record<string, unknown>[] | null;
    error: Error | null;
    count: number | null;
  };

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

  return { venues: processedVenues as Venue[], count: typeof count === 'number' ? count : null };
}

// Stable empty fallback so consumers' memos/effects don't re-run every render.
const NO_VENUES: Venue[] = [];

/**
 * Declarative venues list for surfaces that show one slice (a city, a country,
 * a village, the map viewport). `filters: null` stays idle while the scope is
 * still loading, so no unscoped query fires first.
 *
 * Venues are safety-gated by RLS and the query cache is not cleared on
 * sign-out, so the key carries the viewer. `keepPrevious` holds the last
 * result while a new filter loads (the map pans), never across viewers.
 */
export function useVenuesQuery(filters: VenueFilters | null, opts?: { keepPrevious?: boolean }) {
  const { user } = useAuth();
  const viewer = user?.id ?? 'anon';
  const query = useQuery<Venue[]>({
    queryKey: ['venues', viewer, filters],
    enabled: filters !== null,
    placeholderData: opts?.keepPrevious
      ? (prev, prevQuery) => (prevQuery?.queryKey[1] === viewer ? prev : undefined)
      : undefined,
    queryFn: async ({ signal }) => (await fetchVenuesPage(filters ?? undefined, { signal })).venues,
  });
  return {
    venues: query.data ?? NO_VENUES,
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? query.error.message || 'Failed to fetch venues' : null,
  };
}

interface VenuesFeedRequest {
  filters: VenueFilters;
  paged: boolean;
  pageSize: number;
  sort?: string;
  useRanking?: boolean;
  userId?: string | null;
}

/**
 * The paged /venues list on useInfiniteQuery.
 *
 * The page still decides which request runs and when, through `fetchVenues`
 * with the old signature; that call now records the request, and the query key
 * is the request, so the newest request wins by construction (the old hook had
 * no ordering at all — a slow stale response could overwrite a newer one).
 * `loadMore` asks for the next page of the SAME request. Re-issuing an
 * identical request refetches.
 *
 * Keyed on the viewer: venues are safety-gated and the cache is not cleared on
 * sign-out.
 */
export function useVenuesFeed() {
  const { user } = useAuth();
  const viewer = user?.id ?? 'anon';
  const [request, setRequest] = useState<VenuesFeedRequest | null>(null);
  const requestRef = useRef<VenuesFeedRequest | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['venues-feed', viewer, request],
    enabled: request !== null,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const r = request!;
      return fetchVenuesPage(r.filters, {
        ...(r.paged ? { page: pageParam, pageSize: r.pageSize } : {}),
        sort: r.sort,
        useRanking: r.useRanking,
        userId: r.userId,
        signal,
      });
    },
    getNextPageParam: (last, _all, lastPage) => {
      const r = request;
      if (!r?.paged || typeof last.count !== 'number') return undefined;
      return (lastPage - 1) * r.pageSize + last.venues.length < last.count
        ? lastPage + 1
        : undefined;
    },
  });

  const { data, refetch, fetchNextPage } = query;
  const venues = useMemo(() => {
    if (!data) return NO_VENUES;
    // Same merge the append path used: dedupe by id across pages.
    const merged = data.pages.flatMap((p) => p.venues);
    return Array.from(new Map(merged.map((v) => [v.id, v])).values());
  }, [data]);

  const fetchVenues = useCallback(
    async (
      filters?: VenueFilters,
      options?: {
        page?: number;
        pageSize?: number;
        sort?: string;
        useRanking?: boolean;
        userId?: string | null;
      },
    ) => {
      const next: VenuesFeedRequest = {
        filters: filters ?? {},
        paged: typeof options?.page === 'number',
        pageSize: options?.pageSize ?? 24,
        sort: options?.sort,
        useRanking: options?.useRanking,
        userId: options?.userId,
      };
      // A ref, not the state: two calls in one tick must compare against each
      // other, and the refetch must not run inside a state updater.
      const prev = requestRef.current;
      if (prev && hashKey([prev]) === hashKey([next])) {
        void refetch();
        return;
      }
      requestRef.current = next;
      setRequest(next);
    },
    [refetch],
  );

  const loadMore = useCallback(async () => {
    await fetchNextPage();
  }, [fetchNextPage]);

  const { data: datasetTotal = null } = useQuery({
    // Unfiltered COUNT(*) for "showing N of M". RLS hides gated rows from
    // anon, so the total is per viewer too.
    queryKey: ['venues-dataset-total', viewer],
    queryFn: async () => {
      const { count } = await supabase
        .from('venues')
        .select('id', { head: true, count: 'exact' })
        .neq('data_source', 'refuge-restrooms')
        .neq('review_status', 'archived')
        .is('duplicate_of_id', null)
        .is('closed_at', null);
      return count ?? 0;
    },
  });

  const loading = query.isLoading;
  const requestHash = hashKey([viewer, request]);
  const [timedOutFor, setTimedOutFor] = useState<string | null>(null);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setTimedOutFor(requestHash), 15000);
    return () => clearTimeout(timer);
  }, [loading, requestHash]);

  return {
    venues,
    loading,
    loadingMore: query.isFetchingNextPage,
    loadingTimedOut: loading && timedOutFor === requestHash,
    error: query.error ? query.error.message || 'Failed to fetch venues' : null,
    hasMore: query.hasNextPage,
    datasetTotal,
    /** The filtered total of the current request (first page's count). */
    filteredTotal: data?.pages[0]?.count ?? null,
    fetchVenues,
    loadMore,
  };
}
