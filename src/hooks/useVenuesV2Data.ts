/**
 * Data hooks for the /venues v2 surface. Centralizing supabase.from() calls
 * here (per the queerguide/no-supabase-from-in-pages lint rule) so pages
 * and components stay declarative.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

export interface LeaderboardRow {
  user_id: string;
  venues_visited: number;
  total_checkins?: number;
  points: number;
  rank: number;
  display_name: string | null;
  avatar_url: string | null;
}

async function hydrateProfiles(rows: Array<{ user_id: string }>) {
  const ids = rows.map((r) => r.user_id);
  if (!ids.length)
    return new Map<string, { display_name: string | null; avatar_url: string | null }>();
  const { data } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', ids);
  return new Map(
    (
      (data as Array<{
        user_id: string;
        display_name: string | null;
        avatar_url: string | null;
      }>) ?? []
    ).map((p) => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }]),
  );
}

// Stable empty fallback so consumers' memos/effects don't re-run every render.
const NONE: never[] = [];

// venues are safety-gated by RLS, so every venues query keys on the viewer:
// the app does not clear the query cache on sign-out, and an entry fetched
// while signed in must never be served to an anonymous visitor.
export function useFeaturedVenue() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['venues-featured-hero', user?.id ?? 'anon'],
    queryFn: async () => {
      const { data } = await supabase
        .from('venues')
        .select('*')
        .eq('is_featured', true)
        .neq('data_source', 'refuge-restrooms')
        .neq('review_status', 'archived')
        .is('duplicate_of_id', null)
        .not('images', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as Venue) ?? null;
    },
  });
  return { venue: data ?? null, loading: isLoading };
}

export function useEditorsPicks(limit = 8) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['venues-editors-picks', user?.id ?? 'anon', limit],
    queryFn: async () => {
      const { data } = await supabase
        .from('venues')
        .select('*')
        .eq('is_featured', true)
        .neq('data_source', 'refuge-restrooms')
        .neq('review_status', 'archived')
        .is('duplicate_of_id', null)
        .order('updated_at', { ascending: false })
        .limit(limit);
      return (data as Venue[]) ?? [];
    },
  });
  return { venues: data ?? NONE, loading: isLoading };
}

export function useCityLeaderboard(cityId: string | null, limit = 5) {
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['venue-leaderboard', cityId, limit],
    // Keep the previous city's rows on screen while the next city loads,
    // still reporting loading, as the effect version did.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // The venue_leaderboard_* mat views are not API-exposed (linter 0016);
      // rpc_venue_leaderboard is the SECURITY DEFINER gateway.
      const { data } = await untypedRpc<Array<Omit<LeaderboardRow, 'display_name' | 'avatar_url'>>>(
        'rpc_venue_leaderboard',
        { p_city_id: cityId, p_limit: limit },
      );
      const lb = data ?? [];
      const map = await hydrateProfiles(lb);
      return lb.map((r) => ({
        ...r,
        display_name: map.get(r.user_id)?.display_name ?? null,
        avatar_url: map.get(r.user_id)?.avatar_url ?? null,
      }));
    },
  });
  return { rows: data ?? NONE, loading: isLoading || isPlaceholderData };
}

export function useGlobalLeaderboard(limit = 100) {
  return useCityLeaderboard(null, limit);
}

type DiscoveryProfile = {
  categories?: string[];
  tags?: string[];
  target_groups?: string[];
  primary_city_id?: string;
  primary_city_name?: string;
};

export function useDiscoveryProfile() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['discovery-profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // discovery_profile is outside the `authenticated` column allowlist on `profiles`.
      const { data: row } = await supabase.rpc('get_my_profile').maybeSingle();
      return (
        ((row as { discovery_profile?: unknown } | null)?.discovery_profile as DiscoveryProfile) ??
        null
      );
    },
  });
  return { data: user ? (data ?? null) : null, loading: isLoading };
}

export async function saveDiscoveryProfile(userId: string, dp: Record<string, unknown>) {
  return untypedFrom('profiles').update({ discovery_profile: dp }).eq('user_id', userId);
}

export interface VisitedVenue {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  images: string[] | null;
  last_checkin: string;
}

export function useVisitedVenues() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['visited-venues', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<VisitedVenue[]> => {
      const { data: checkins } = await supabase
        .from('venue_checkins')
        .select('venue_id, checked_in_at')
        .eq('user_id', user!.id)
        .order('checked_in_at', { ascending: false });
      const seen = new Map<string, string>();
      for (const c of (checkins as Array<{ venue_id: string; checked_in_at: string }>) ?? []) {
        if (!seen.has(c.venue_id)) seen.set(c.venue_id, c.checked_in_at);
      }
      const ids = Array.from(seen.keys());
      if (ids.length === 0) return [];
      const { data: vs } = await supabase
        .from('venues')
        .select('id, name, slug, city, country, images')
        .in('id', ids);
      return ((vs as Array<Omit<VisitedVenue, 'last_checkin'>>) ?? [])
        .map((v) => ({ ...v, last_checkin: seen.get(v.id) ?? '' }))
        .sort((a, b) => b.last_checkin.localeCompare(a.last_checkin));
    },
  });
  return { venues: user ? (data ?? NONE) : NONE, loading: isLoading };
}

export function useCityAutocomplete(query: string) {
  const { data } = useQuery({
    queryKey: ['city-autocomplete', query],
    // Keep the last matches visible while the next keystroke's query runs.
    placeholderData: keepPreviousData,
    enabled: query.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('cities')
        .select('id, name')
        .is('duplicate_of_id', null)
        .ilike('name', `%${query}%`)
        .limit(5);
      return (data as Array<{ id: string; name: string }>) ?? [];
    },
  });
  return query.length >= 2 ? (data ?? NONE) : NONE;
}
