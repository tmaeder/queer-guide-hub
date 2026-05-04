import { useState, useEffect, useCallback } from 'react';
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
}

const PAGE_SIZE = 24;

export function useHotels(autoFetch = true) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [datasetTotal, setDatasetTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('hotels')
        .select('id', { head: true, count: 'exact' });
      if (!cancelled) setDatasetTotal(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchHotels = useCallback(async (
    filters?: HotelFilters,
    options?: { page?: number; pageSize?: number; append?: boolean },
  ) => {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? PAGE_SIZE;

    try {
      setLoading(true);
      setError(null);

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
        !filters?.featured;
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
          if (options?.append) {
            setHotels((prev) =>
              Array.from(
                new Map([...prev, ...slice].map((h) => [h.id, h])).values(),
              ),
            );
          } else {
            setHotels(slice);
          }
          // The RPC returns the FULL ranked set up to `result_limit`; treat
          // (ranked.length === limit) as "more might exist beyond this fetch".
          setTotalCount(ranked?.length ?? 0);
          setHasMore((ranked?.length ?? 0) > from + slice.length);
          setLoading(false);
          return;
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
        query = query.or(
          `city.ilike.${q}%,country.ilike.${q}%,name.ilike.${q}%`,
        );
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

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error: fetchError, count } = await query;
      if (fetchError) throw fetchError;

      if (options?.append) {
        setHotels(prev => {
          const merged = [...prev, ...(data || [])];
          return Array.from(new Map(merged.map(h => [h.id, h])).values());
        });
      } else {
        setHotels(data || []);
      }

      if (typeof count === 'number') {
        setTotalCount(count);
        setHasMore(from + (data?.length || 0) < count);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch hotels');
    } finally {
      setLoading(false);
    }
  }, []);

  const createHotel = useCallback(async (hotel: HotelInsert) => {
    const { data, error } = await supabase
      .from('hotels')
      .insert(hotel)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, []);

  const updateHotel = useCallback(async (id: string, changes: Partial<HotelInsert>) => {
    const { data, error } = await supabase
      .from('hotels')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, []);

  const deleteHotel = useCallback(async (id: string) => {
    const { error } = await supabase.from('hotels').delete().eq('id', id);
    if (error) throw error;
  }, []);

  useEffect(() => {
    if (autoFetch) fetchHotels();
  }, [autoFetch, fetchHotels]);

  return {
    hotels,
    loading,
    error,
    hasMore,
    totalCount,
    datasetTotal,
    fetchHotels,
    createHotel,
    updateHotel,
    deleteHotel,
    refetch: () => fetchHotels(),
  };
}
