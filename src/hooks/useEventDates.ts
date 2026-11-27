import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TimedEvent } from '@/lib/eventTiming';

export type EventDateRow = TimedEvent & { id: string };

/**
 * Start/end/status for a handful of event ids. Recommendation hits from the
 * search worker carry no dates, so a "Where to next?" card for one occurrence
 * of a recurring night read exactly like every other occurrence.
 */
export function useEventDates(ids: string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['event-dates', key],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, EventDateRow>> => {
      const { data, error } = await supabase
        .from('events')
        .select('id,start_date,end_date,timezone,status,liveness_status')
        .in('id', ids);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.id, r as EventDateRow]));
    },
  });
}
