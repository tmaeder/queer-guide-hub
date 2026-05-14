import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UpcomingPrideEvent {
  id: string;
  title: string;
  event_type: string | null;
  start_date: string | null;
  end_date: string | null;
  images: string[] | null;
  city: { id: string; name: string } | null;
  country: { id: string; name: string; code: string | null; equality_score: number | null } | null;
}

interface UseUpcomingPrideEventsOptions {
  months?: number;
  limit?: number;
  enabled?: boolean;
}

export function useUpcomingPrideEvents({
  months = 4,
  limit = 12,
  enabled = true,
}: UseUpcomingPrideEventsOptions = {}) {
  return useQuery({
    queryKey: ['upcoming-pride-events', months, limit],
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<UpcomingPrideEvent[]> => {
      const now = new Date();
      const end = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('events')
        .select(
          `id, title, event_type, start_date, end_date, images,
           city:city_id(id, name),
           country:country_id(id, name, code, equality_score)`,
        )
        .or('event_type.ilike.%pride%,event_type.ilike.%festival%')
        .gte('start_date', now.toISOString())
        .lte('start_date', end.toISOString())
        .is('duplicate_of_id', null)
        .order('start_date', { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as unknown as UpcomingPrideEvent[];
    },
  });
}
