import { useQuery } from '@tanstack/react-query';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { FootprintStats } from '@/components/footprint/deriveBadges';

const ZERO: FootprintStats = {
  countries_visited: 0,
  total_countries: 0,
  cities_visited: 0,
  venues_visited: 0,
  events_visited: 0,
  villages_visited: 0,
  continents_touched: 0,
  pride_events: 0,
};

function toStats(row: unknown): FootprintStats {
  if (!row || typeof row !== 'object') return ZERO;
  const r = row as Record<string, unknown>;
  const n = (k: string) => Number(r[k] ?? 0) || 0;
  return {
    countries_visited: n('countries_visited'),
    total_countries: n('total_countries'),
    cities_visited: n('cities_visited'),
    venues_visited: n('venues_visited'),
    events_visited: n('events_visited'),
    villages_visited: n('villages_visited'),
    continents_touched: n('continents_touched'),
    pride_events: n('pride_events'),
  };
}

export function useFootprintStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['footprint-stats', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<FootprintStats> => {
      const { data, error } = await untypedSupabase.rpc('footprint_stats', {
        p_user_id: user!.id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return toStats(row);
    },
  });
}

export interface FootprintReturnNudge {
  city_id: string;
  city_name: string;
  city_slug: string | null;
  visited_count: number;
  last_visited_at: string;
  new_venues: number;
}

export function useFootprintReturnNudge() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['footprint-return-nudge', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<FootprintReturnNudge | null> => {
      const { data, error } = await untypedSupabase.rpc('footprint_return_nudge', {
        p_user_id: user!.id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      const r = row as Record<string, unknown>;
      return {
        city_id: String(r.city_id ?? ''),
        city_name: String(r.city_name ?? ''),
        city_slug: (r.city_slug as string | null) ?? null,
        visited_count: Number(r.visited_count ?? 0),
        last_visited_at: String(r.last_visited_at ?? ''),
        new_venues: Number(r.new_venues ?? 0),
      };
    },
  });
}

export interface FootprintSharePrefs {
  share_countries: boolean;
  share_cities: boolean;
  share_venues: boolean;
  share_events: boolean;
  share_villages: boolean;
}

const DEFAULT_PREFS: FootprintSharePrefs = {
  share_countries: false,
  share_cities: false,
  share_venues: false,
  share_events: false,
  share_villages: false,
};

export function useFootprintSharePrefs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['footprint-share-prefs', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<FootprintSharePrefs> => {
      const { data, error } = await untypedSupabase
        .from('user_footprint_share_prefs')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_PREFS;
      const r = data as Record<string, unknown>;
      return {
        share_countries: !!r.share_countries,
        share_cities: !!r.share_cities,
        share_venues: !!r.share_venues,
        share_events: !!r.share_events,
        share_villages: !!r.share_villages,
      };
    },
  });
}
