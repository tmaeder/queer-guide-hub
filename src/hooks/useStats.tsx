import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Stats {
  venues: number;
  members: number;
  cities: number;
  weeklyEvents: number;
}

export const useStats = () => {
  const [stats, setStats] = useState<Stats>({
    venues: 0,
    members: 0,
    cities: 0,
    weeklyEvents: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
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
        
        setStats({
          venues: venuesResult.status === 'fulfilled' ? (venuesResult.value.count || 0) : 0,
          members: membersResult.status === 'fulfilled' ? (membersResult.value.count || 0) : 0,
          cities: citiesResult.status === 'fulfilled' ? (citiesResult.value.count || 0) : 0,
          weeklyEvents: eventsResult.status === 'fulfilled' ? (eventsResult.value.count || 0) : 0
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
        // Set default values on error
        setStats({ venues: 0, members: 0, cities: 0, weeklyEvents: 0 });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return { stats, loading };
};