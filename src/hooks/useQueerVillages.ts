import { useState, useEffect, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { Database } from '@/types/database';

export type QueerVillage = Database['public']['Tables']['queer_villages']['Row'];
type QueerVillageInsert = Database['public']['Tables']['queer_villages']['Insert'];

export type QueerVillageWithRelations = QueerVillage & {
  cities?: { id: string; name: string } | null;
  countries?: { id: string; name: string } | null;
};

export function useQueerVillages(autoFetch = true) {
  const [villages, setVillages] = useState<QueerVillageWithRelations[]>([]);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);

  const fetchVillages = useCallback(async (filters?: { cityId?: string; search?: string }) => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('queer_villages')
        .select('*, cities:city_id(id, name), countries:country_id(id, name)')
        .order('featured', { ascending: false })
        .order('name', { ascending: true });

      if (filters?.cityId) {
        query = query.eq('city_id', filters.cityId);
      }
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setVillages(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch villages');
    } finally {
      setLoading(false);
    }
  }, []);

  const createVillage = useCallback(async (village: QueerVillageInsert) => {
    const { data, error } = await api.from('queer_villages').insert(village).select().single();
    if (error) throw error;
    return data;
  }, []);

  const updateVillage = useCallback(async (id: string, changes: Partial<QueerVillageInsert>) => {
    const { data, error } = await supabase
      .from('queer_villages')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, []);

  const deleteVillage = useCallback(async (id: string) => {
    const { error } = await api.from('queer_villages').delete().eq('id', id);
    if (error) throw error;
  }, []);

  useEffect(() => {
    if (autoFetch) fetchVillages();
  }, [autoFetch, fetchVillages]);

  return { villages, loading, error, fetchVillages, createVillage, updateVillage, deleteVillage, refetch: () => fetchVillages() };
}
