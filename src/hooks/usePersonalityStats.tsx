import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PersonalityStats {
  total: number;
  verified: number;
  featured: number;
  living: number;
  deceased: number;
  recentlyAdded: number; // last 30 days
}

export function usePersonalityStats() {
  const [stats, setStats] = useState<PersonalityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get total count
      const { count: total, error: totalError } = await supabase
        .from('personalities')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'public');

      if (totalError) throw totalError;

      // Get verified count
      const { count: verified, error: verifiedError } = await supabase
        .from('personalities')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'public')
        .eq('verification_status', 'verified');

      if (verifiedError) throw verifiedError;

      // Get featured count
      const { count: featured, error: featuredError } = await supabase
        .from('personalities')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'public')
        .eq('is_featured', true);

      if (featuredError) throw featuredError;

      // Get living count
      const { count: living, error: livingError } = await supabase
        .from('personalities')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'public')
        .eq('is_living', true);

      if (livingError) throw livingError;

      // Get deceased count
      const { count: deceased, error: deceasedError } = await supabase
        .from('personalities')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'public')
        .eq('is_living', false);

      if (deceasedError) throw deceasedError;

      // Get recently added count (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count: recentlyAdded, error: recentError } = await supabase
        .from('personalities')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'public')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (recentError) throw recentError;

      setStats({
        total: total || 0,
        verified: verified || 0,
        featured: featured || 0,
        living: living || 0,
        deceased: deceased || 0,
        recentlyAdded: recentlyAdded || 0
      });
    } catch (err) {
      console.error('Error fetching personality stats:', err);
      setError('Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats
  };
}