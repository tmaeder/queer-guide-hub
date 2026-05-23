import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PrideCalendarEvent {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date: string | null;
  city: string | null;
  city_id: string | null;
  country: string | null;
  country_id: string | null;
  latitude: number | null;
  longitude: number | null;
  images: string[] | null;
  is_featured: boolean;
  verification_status: string;
  description: string | null;
}

interface UsePrideCalendarOptions {
  year: number;
  enabled?: boolean;
}

export function usePrideCalendar({ year, enabled = true }: UsePrideCalendarOptions) {
  return useQuery({
    queryKey: ['pride-calendar', year],
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<PrideCalendarEvent[]> => {
      const start = `${year}-01-01T00:00:00Z`;
      const end = `${year + 1}-01-01T00:00:00Z`;
      const { data, error } = await supabase
        .from('events')
        .select(
          `id, slug, title, start_date, end_date,
           city, city_id, country, country_id,
           latitude, longitude, images,
           is_featured, verification_status, description`,
        )
        .eq('event_type', 'pride')
        .eq('status', 'active')
        .gte('start_date', start)
        .lt('start_date', end)
        .is('duplicate_of_id', null)
        .order('start_date', { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
      })) as PrideCalendarEvent[];
    },
  });
}

export function usePrideCalendarSummary(year: number) {
  const { data, isLoading } = usePrideCalendar({ year });
  const summary = data
    ? {
        total: data.length,
        countries: new Set(data.map((e) => e.country).filter(Boolean)).size,
        cities: new Set(data.map((e) => e.city).filter(Boolean)).size,
        featured: data.filter((e) => e.is_featured).length,
      }
    : { total: 0, countries: 0, cities: 0, featured: 0 };
  return { summary, isLoading };
}
