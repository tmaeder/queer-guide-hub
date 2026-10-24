import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Hotel = Database['public']['Tables']['hotels']['Row'];
type HotelInsert = Database['public']['Tables']['hotels']['Insert'];

export interface HotelFilters {
  search?: string;
  city?: string;
  country?: string;
  hotel_type?: string;
  price_range?: number;
  lgbtq_friendly?: boolean;
  featured?: boolean;
  tagSlug?: string;
}

const PAGE_SIZE = 24;
const MAP_CAP = 500;

export interface HotelsPageOptions {
  /** 1-based. */
  page?: number;
  pageSize?: number;
  /** One page of up to MAP_CAP rows from the top, for the map view. */
  mapMode?: boolean;
}

/**
 * One hotels page, with no React state: the tag pre-filter, the ranked
 * search_hotels RPC for a bare text search (falling back to the column query),
 * and the column query with its stable ordering. `count` is what the
 * next-page test compares against.
 */
export async function fetchHotelsPage(
  filters: HotelFilters | undefined,
  options: HotelsPageOptions = {},
): Promise<{ hotels: Hotel[]; count: number | null }> {
  const page = options.page ?? 1;
  const pageSize = options.mapMode ? MAP_CAP : (options.pageSize ?? PAGE_SIZE);
  const mapMode = options.mapMode === true;

  // Tag filter: resolve hotel IDs from unified_tag_assignments first,
  // then constrain the main query. Cheap enough at our scale and avoids
  // adding a Postgres view.
  let tagFilteredIds: string[] | null = null;
  if (filters?.tagSlug) {
    const { data: tagRows } = await supabase
      .from('unified_tag_assignments')
      .select('entity_id, unified_tags!inner(slug)')
      .eq('entity_type', 'hotel')
      .eq('unified_tags.slug', filters.tagSlug)
      .limit(2000);
    tagFilteredIds = (tagRows ?? []).map((r) => r.entity_id as string);
    if (tagFilteredIds.length === 0) return { hotels: [], count: 0 };
  }

  // When the user has typed a free-text search and no column-scoped
  // filters, prefer the ranked search_hotels RPC (pg_trgm-backed) so
  // mid-word matches like "Berghain" surface. The RPC also returns
  // hotels rows directly, so the rest of the pipeline is identical.
  // Falls back to the column query below if the RPC isn't deployed
  // yet (PGRST202 = "function does not exist" → silent fallback).
  const onlySearch =
    Boolean(filters?.search) &&
    !filters?.city &&
    !filters?.country &&
    !filters?.hotel_type &&
    !filters?.price_range &&
    filters?.lgbtq_friendly === undefined &&
    !filters?.featured &&
    !filters?.tagSlug &&
    !mapMode;
  if (onlySearch && filters?.search) {
    const from = (page - 1) * pageSize;
    const limit = from + pageSize;
    const { data: ranked, error: rpcError } = await (
      supabase as unknown as {
        rpc: (
          fn: string,
          args: { q: string; result_limit: number },
        ) => Promise<{ data: Hotel[] | null; error: { code?: string } | null }>;
      }
    ).rpc('search_hotels', { q: filters.search, result_limit: limit });
    if (!rpcError) {
      const slice = (ranked ?? []).slice(from, from + pageSize);
      // The RPC returns the FULL ranked set up to `result_limit`; its
      // length is the count the next-page test compares against.
      return { hotels: slice, count: ranked?.length ?? 0 };
    }
    // PGRST202 (function not found) or any RPC error → fall through to
    // the legacy prefix-OR path below. Logged once to surface deploy
    // issues; subsequent failures stay quiet.
    if (rpcError.code !== 'PGRST202') {
      console.warn('search_hotels RPC failed, falling back:', rpcError);
    }
  }

  let query = supabase
    .from('hotels')
    .select('*', { count: 'exact' })
    // Curated promotion rank first; rows without a priority sink to the
    // bottom of this sub-order and fall back to the legacy `featured`
    // boolean. Once ingestion fully populates featured_priority we can
    // drop the boolean from the order.
    .order('featured_priority', { ascending: false, nullsFirst: false })
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
    // Stable tiebreaker. Without it, rows that share `featured` and
    // `created_at` (108/312 hotels are featured; all 312 share a single
    // created_at on prod) shuffle between range() requests, producing
    // duplicate IDs across Load More pages.
    .order('id', { ascending: true });

  if (filters?.search) {
    // Tier-1 prefix match on city / country / name. Prefix (no leading
    // wildcard) keeps "Berlin" from matching hosts who happen to drop
    // "Berlin" mid-name (e.g. "Modern flat Berlin Alexander Platz...").
    // PostgREST .or() takes a single comma-separated filter string; we
    // escape commas/parens just in case.
    const q = filters.search.replace(/[,()]/g, ' ');
    query = query.or(`city.ilike.${q}%,country.ilike.${q}%,name.ilike.${q}%`);
  }
  if (filters?.city) {
    query = query.ilike('city', `%${filters.city}%`);
  }
  if (filters?.country) {
    query = query.ilike('country', `%${filters.country}%`);
  }
  if (filters?.hotel_type && filters.hotel_type !== 'all') {
    // ilike (no wildcards) = case-insensitive equality. Defensive against
    // ingestion writing display-cased values like "Apartment" or "B&B".
    query = query.ilike('hotel_type', filters.hotel_type);
  }
  if (filters?.price_range) {
    query = query.eq('price_range', filters.price_range);
  }
  if (filters?.lgbtq_friendly !== undefined) {
    query = query.eq('lgbtq_friendly', filters.lgbtq_friendly);
  }
  if (filters?.featured) {
    query = query.eq('featured', true);
  }
  if (tagFilteredIds) {
    query = query.in('id', tagFilteredIds);
  }

  const from = mapMode ? 0 : (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error: fetchError, count } = await query;
  if (fetchError) throw fetchError;

  return { hotels: data ?? [], count: typeof count === 'number' ? count : null };
}

export interface HotelsFeedRequest {
  filters: HotelFilters;
  mapMode: boolean;
}

const NO_HOTELS: Hotel[] = [];

/**
 * The /hotels list on useInfiniteQuery. `request` is derived by the page from
 * its filter state; the query key is the request, so the newest request wins
 * and `loadMore` fetches the next page of the SAME request. The map view is a
 * single MAP_CAP page and never has a next page.
 *
 * Keyed on the viewer: hotels are safety-gated and the cache is not cleared
 * on sign-out.
 */
export function useHotelsFeed(request: HotelsFeedRequest) {
  const { user } = useAuth();
  const viewer = user?.id ?? 'anon';
  const query = useInfiniteQuery({
    queryKey: ['hotels-feed', viewer, request],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchHotelsPage(request.filters, { page: pageParam, mapMode: request.mapMode }),
    getNextPageParam: (last, _all, lastPage) => {
      if (request.mapMode || typeof last.count !== 'number') return undefined;
      return (lastPage - 1) * PAGE_SIZE + last.hotels.length < last.count
        ? lastPage + 1
        : undefined;
    },
  });
  const { data, fetchNextPage } = query;
  const hotels = useMemo(() => {
    if (!data) return NO_HOTELS;
    // Same merge the append path used: dedupe by id across pages.
    const merged = data.pages.flatMap((p) => p.hotels);
    return Array.from(new Map(merged.map((h) => [h.id, h])).values());
  }, [data]);

  const { data: datasetTotal = null } = useQuery({
    // Unfiltered COUNT(*) — RLS hides gated rows from anon, so per viewer.
    queryKey: ['hotels-dataset-total', viewer],
    queryFn: async () => {
      const { count } = await supabase.from('hotels').select('id', { head: true, count: 'exact' });
      return count ?? 0;
    },
  });

  return {
    hotels,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    error: query.error ? query.error.message || 'Failed to fetch hotels' : null,
    hasMore: query.hasNextPage,
    totalCount: data?.pages[0]?.count ?? 0,
    datasetTotal,
    loadMore: () => void fetchNextPage(),
  };
}

// ── Admin writes (HotelsManager) ────────────────────────────────────────────

export async function createHotel(hotel: HotelInsert) {
  const { data, error } = await supabase.from('hotels').insert(hotel).select().single();
  if (error) throw error;
  return data;
}

export async function updateHotel(id: string, changes: Partial<HotelInsert>) {
  const { data, error } = await supabase
    .from('hotels')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHotel(id: string) {
  const { error } = await supabase.from('hotels').delete().eq('id', id);
  if (error) throw error;
}

/** Recompose one hotel's queer_safety_notes from its amenity signals via the
 *  deterministic SQL composer, then return the freshly written note. */
export async function regenerateSafetyNote(id: string): Promise<string> {
  const { error } = await supabase.rpc('run_hotel_safety_backfill', { p_hotel_id: id });
  if (error) throw error;
  const { data, error: readErr } = await supabase
    .from('hotels')
    .select('queer_safety_notes')
    .eq('id', id)
    .single();
  if (readErr) throw readErr;
  return data?.queer_safety_notes ?? '';
}
