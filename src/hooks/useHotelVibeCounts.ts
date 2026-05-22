import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Tag counts for the 8 hotel-vibe chips. Used by VibeChipsRow to hide chips
// that would dead-end to "No hotels match your filters" given current data.
export function useHotelVibeCounts() {
  return useQuery({
    queryKey: ['hotel-vibe-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('slug, usage_count')
        .eq('category', 'hotel_vibe');
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const row of data ?? []) {
        out[row.slug as string] = (row.usage_count as number | null) ?? 0;
      }
      return out;
    },
    staleTime: 10 * 60_000,
  });
}
