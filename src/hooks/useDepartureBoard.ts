import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DepartureRowData {
  id: string;
  title: string;
  slug: string | null;
  event_type: string | null;
  start_date: string | null;
  venue_name: string | null;
  city: { id: string; name: string } | null;
}

/** Next departures — the soonest upcoming events across the network.
 *  Feeds the homepage departures board. */
export function useDepartureBoard(limit = 6) {
  return useQuery({
    queryKey: ['departure-board', limit],
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<DepartureRowData[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, slug, event_type, start_date, venue_name, city:cities(id, name)')
        .gte('start_date', new Date().toISOString())
        .is('duplicate_of_id', null)
        .order('start_date', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as DepartureRowData[];
    },
  });
}
