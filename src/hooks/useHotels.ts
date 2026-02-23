import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

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

  const fetchHotels = useCallback(async (
    filters?: HotelFilters,
    options?: { page?: number; pageSize?: number; append?: boolean },
  ) => {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? PAGE_SIZE;

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('hotels')
        .select('*', { count: 'exact' })
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters?.city) {
        query = query.ilike('city', `%${filters.city}%`);
      }
      if (filters?.country) {
        query = query.ilike('country', `%${filters.country}%`);
      }
      if (filters?.hotel_type && filters.hotel_type !== 'all') {
        query = query.eq('hotel_type', filters.hotel_type);
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
    fetchHotels,
    createHotel,
    updateHotel,
    deleteHotel,
    refetch: () => fetchHotels(),
  };
}
