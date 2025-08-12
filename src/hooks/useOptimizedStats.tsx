import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Stats {
  venues: number;
  members: number;
  cities: number;
  weeklyEvents: number;
}

const STATS_QUERY_KEY = 'dashboard_stats';
const CACHE_TIME = 15 * 60 * 1000; // 15 minutes - stats don't change frequently
const STALE_TIME = 10 * 60 * 1000; // 10 minutes

export const useOptimizedStats = () => {
  const fetchStats = async (): Promise<Stats> => {
    // Compute stats via individual queries in parallel (typed-safe)
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    
    // Use Promise.allSettled for parallel execution and error resilience
    const results = await Promise.allSettled([
      supabase.from('venues').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('cities').select('id', { count: 'exact', head: true }),
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .gte('start_date', new Date().toISOString())
        .lte('start_date', oneWeekFromNow.toISOString())
    ]);

    // Extract successful results or default to 0
    const [venuesResult, membersResult, citiesResult, eventsResult] = results;
    
    return {
      venues: venuesResult.status === 'fulfilled' ? (venuesResult.value.count || 0) : 0,
      members: membersResult.status === 'fulfilled' ? (membersResult.value.count || 0) : 0,
      cities: citiesResult.status === 'fulfilled' ? (citiesResult.value.count || 0) : 0,
      weeklyEvents: eventsResult.status === 'fulfilled' ? (eventsResult.value.count || 0) : 0
    };
  };

  const {
    data: stats = { venues: 0, members: 0, cities: 0, weeklyEvents: 0 },
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [STATS_QUERY_KEY],
    queryFn: fetchStats,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 5000,
  });

  return { 
    stats, 
    loading: isLoading, 
    error: error?.message || null,
    refetch 
  };
};