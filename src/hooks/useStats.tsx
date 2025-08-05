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
        // Get venues count - use proper count queries without limits
        const { count: venuesCount, error: venuesError } = await supabase
          .from('venues')
          .select('id', { count: 'exact', head: true });

        // Get members count
        const { count: membersCount, error: membersError } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true });

        // Get cities count
        const { count: citiesCount, error: citiesError } = await supabase
          .from('cities')
          .select('id', { count: 'exact', head: true });

        // Get weekly events count (events from the last 7 days or upcoming events)
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        
        const { count: weeklyEventsCount, error: eventsError } = await supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .gte('start_date', new Date().toISOString())
          .lte('start_date', oneWeekFromNow.toISOString());

        // Log any errors
        if (venuesError) console.error('Error counting venues:', venuesError);
        if (membersError) console.error('Error counting members:', membersError);
        if (citiesError) console.error('Error counting cities:', citiesError);
        if (eventsError) console.error('Error counting events:', eventsError);

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