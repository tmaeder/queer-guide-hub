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
        // Get venues count
        const { count: venuesCount } = await supabase
          .from('venues')
          .select('*', { count: 'exact', head: true });

        // Get members count
        const { count: membersCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        // Get cities count
        const { count: citiesCount } = await supabase
          .from('cities')
          .select('*', { count: 'exact', head: true });

        // Get weekly events count (events from the last 7 days or upcoming events)
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        
        const { count: weeklyEventsCount } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .gte('start_date', new Date().toISOString())
          .lte('start_date', oneWeekFromNow.toISOString());

        setStats({
          venues: venuesCount || 0,
          members: membersCount || 0,
          cities: citiesCount || 0,
          weeklyEvents: weeklyEventsCount || 0
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return { stats, loading };
};