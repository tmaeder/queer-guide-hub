import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export async function fetchNearbyVenues(id: string) {
  const { data: source, error } = await supabase
    .from('venues')
    .select('city_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  // No global fallback: a missing city must never recommend another country.
  if (!source?.city_id) return [];
  const { data, error: listError } = await supabase
    .from('venues')
    .select('*')
    .eq('city_id', source.city_id)
    .neq('id', id)
    .neq('review_status', 'archived')
    .neq('data_source', 'refuge-restrooms')
    .is('duplicate_of_id', null)
    .is('closed_at', null)
    .order('name')
    .limit(6);
  if (listError) throw listError;
  return data ?? [];
}

export function useNearbyVenues(id: string) {
  return useQuery({
    queryKey: ['nearby-venues', id],
    queryFn: () => fetchNearbyVenues(id),
    staleTime: 300000,
  });
}
