import { useState, useEffect, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { useLoadingState } from './useLoadingState';

interface ConsolidatedStats {
  venues: number;
  profiles: number;
  cities: number;
  countries: number;
  events: number;
  posts: number;
  personalities: number;
  groups: number;
  tags: number;
  marketplace: number;
  news: number;
  cms: number;
}

const DEFAULT_STATS: ConsolidatedStats = {
  venues: 0,
  profiles: 0,
  cities: 0,
  countries: 0,
  events: 0,
  posts: 0,
  personalities: 0,
  groups: 0,
  tags: 0,
  marketplace: 0,
  news: 0,
  cms: 0
};

export function useConsolidatedStats() {
  const [stats, setStats] = useState<ConsolidatedStats>(DEFAULT_STATS);
  const { loading, error, withLoading } = useLoadingState({ initialLoading: true });

  const fetchStats = useCallback(async () => {
    return withLoading(async () => {
      const results = await Promise.allSettled([
        api.from('venues').select('id', { count: 'exact', head: true }),
        api.from('profiles').select('id', { count: 'exact', head: true }),
        api.from('cities').select('id', { count: 'exact', head: true }),
        api.from('countries').select('id', { count: 'exact', head: true }),
        api.from('events').select('id', { count: 'exact', head: true }),
        api.from('community_posts').select('id', { count: 'exact', head: true }),
        api.from('personalities').select('id', { count: 'exact', head: true }),
        api.from('community_groups').select('id', { count: 'exact', head: true }),
        api.from('unified_tags').select('id', { count: 'exact', head: true }),
        api.from('marketplace_listings').select('id', { count: 'exact', head: true }),
        api.from('news_articles').select('id', { count: 'exact', head: true }),
        api.from('cms_content').select('id', { count: 'exact', head: true }).is('deleted_at', null)
      ]);

      const newStats: ConsolidatedStats = {
        venues: results[0].status === 'fulfilled' ? results[0].value.count || 0 : 0,
        profiles: results[1].status === 'fulfilled' ? results[1].value.count || 0 : 0,
        cities: results[2].status === 'fulfilled' ? results[2].value.count || 0 : 0,
        countries: results[3].status === 'fulfilled' ? results[3].value.count || 0 : 0,
        events: results[4].status === 'fulfilled' ? results[4].value.count || 0 : 0,
        posts: results[5].status === 'fulfilled' ? results[5].value.count || 0 : 0,
        personalities: results[6].status === 'fulfilled' ? results[6].value.count || 0 : 0,
        groups: results[7].status === 'fulfilled' ? results[7].value.count || 0 : 0,
        tags: results[8].status === 'fulfilled' ? results[8].value.count || 0 : 0,
        marketplace: results[9].status === 'fulfilled' ? results[9].value.count || 0 : 0,
        news: results[10].status === 'fulfilled' ? results[10].value.count || 0 : 0,
        cms: results[11].status === 'fulfilled' ? results[11].value.count || 0 : 0,
      };

      setStats(newStats);
      return newStats;
    });
  }, [withLoading]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats
  };
}