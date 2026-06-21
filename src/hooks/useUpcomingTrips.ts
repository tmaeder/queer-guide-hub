import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UpcomingTrip {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  primary_city_name: string | null;
  primary_country_code: string | null;
  cover_image_url: string | null;
  daysUntilStart: number;
}

/** Trips starting within the next `withinDays` days (default 14). */
export function useUpcomingTrips(withinDays = 14) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['upcoming-trips', user?.id, withinDays],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<UpcomingTrip[]> => {
      const today = new Date();
      const ceiling = new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('trips')
        .select('id, title, start_date, end_date, primary_city_name, primary_country_code, cover_image_url')
        .eq('owner_id', user!.id)
        .in('status', ['planning', 'active'])
        .gte('start_date', today.toISOString().slice(0, 10))
        .lte('start_date', ceiling.toISOString().slice(0, 10))
        .order('start_date', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as {
        id: string;
        title: string;
        start_date: string;
        end_date: string | null;
        primary_city_name: string | null;
        primary_country_code: string | null;
        cover_image_url: string | null;
      }[]).map((t) => ({
        ...t,
        daysUntilStart: Math.max(
          0,
          Math.floor(
            (new Date(t.start_date).getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
          ),
        ),
      }));
    },
  });
}
