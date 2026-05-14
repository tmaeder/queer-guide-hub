import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type Continent = Tables<'continents'>;

/** DUP-4 — continents lookup, used by Directory and Places. Cached 30 min — table changes ≈ never. */
const STALE_TIME = 30 * 60_000;


export function useContinents() {
  return useQuery({
    queryKey: ['continents'],
    staleTime: STALE_TIME,
    queryFn: async (): Promise<Continent[]> => {
      const { data, error } = await supabase.from('continents').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as Continent[];
    },
  });
}
