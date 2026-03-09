import { useState, useEffect, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { Database } from '@/types/database';

export type Festival = Database['public']['Tables']['festivals']['Row'];
type FestivalInsert = Database['public']['Tables']['festivals']['Insert'];

export type FestivalWithRelations = Festival & {
  cities?: { id: string; name: string } | null;
  countries?: { id: string; name: string } | null;
};

export type FestivalWithEvents = FestivalWithRelations & {
  events?: Array<Database['public']['Tables']['events']['Row'] & {
    venues?: { id: string; name: string } | null;
  }>;
};

export function useFestivals(autoFetch = true) {
  const [festivals, setFestivals] = useState<FestivalWithRelations[]>([]);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);

  const fetchFestivals = useCallback(async (filters?: {
    type?: string;
    cityId?: string;
    search?: string;
    upcoming?: boolean;
  }) => {
    try {
      setLoading(true);
      setError(null);

      let query = api
        .from('festivals')
        .select('*, cities:city_id(id, name), countries:country_id(id, name)')
        .order('start_date', { ascending: false, nullsFirst: false });

      if (filters?.type && filters.type !== 'all') {
        query = query.eq('festival_type', filters.type);
      }
      if (filters?.cityId) {
        query = query.eq('city_id', filters.cityId);
      }
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters?.upcoming) {
        query = query.gte('end_date', new Date().toISOString());
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setFestivals(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch festivals');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFestivalWithEvents = useCallback(async (id: string): Promise<FestivalWithEvents | null> => {
    const { data: festival, error: festErr } = await api
      .from('festivals')
      .select('*, cities:city_id(id, name), countries:country_id(id, name)')
      .eq('id', id)
      .single();
    if (festErr) throw festErr;
    if (!festival) return null;

    const { data: events } = await api
      .from('events')
      .select('*, venues:venue_id(id, name)')
      .eq('festival_id', id)
      .order('start_date', { ascending: true });

    return { ...festival, events: events || [] };
  }, []);

  const createFestival = useCallback(async (festival: FestivalInsert) => {
    const { data, error } = await api.from('festivals').insert(festival).select().single();
    if (error) throw error;
    return data;
  }, []);

  const updateFestival = useCallback(async (id: string, changes: Partial<FestivalInsert>) => {
    const { data, error } = await api
      .from('festivals')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, []);

  const deleteFestival = useCallback(async (id: string) => {
    const { error } = await api.from('festivals').delete().eq('id', id);
    if (error) throw error;
  }, []);

  const linkEventToFestival = useCallback(async (eventId: string, festivalId: string) => {
    const { error } = await api
      .from('events')
      .update({ festival_id: festivalId })
      .eq('id', eventId);
    if (error) throw error;
  }, []);

  const unlinkEvent = useCallback(async (eventId: string) => {
    const { error } = await api
      .from('events')
      .update({ festival_id: null })
      .eq('id', eventId);
    if (error) throw error;
  }, []);

  useEffect(() => {
    if (autoFetch) fetchFestivals();
  }, [autoFetch, fetchFestivals]);

  return {
    festivals, loading, error,
    fetchFestivals, fetchFestivalWithEvents,
    createFestival, updateFestival, deleteFestival,
    linkEventToFestival, unlinkEvent,
    refetch: () => fetchFestivals(),
  };
}
