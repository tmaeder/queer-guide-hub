/**
 * Data hooks for the /venues v2 surface. Centralizing supabase.from() calls
 * here (per the queerguide/no-supabase-from-in-pages lint rule) so pages
 * and components stay declarative.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  if (!ids.length) return new Map<string, { display_name: string | null; avatar_url: string | null }>();
  const { data } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', ids);
  return new Map(
    ((data as Array<{ user_id: string; display_name: string | null; avatar_url: string | null }>) ?? []).map(
      (p) => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }],
    ),
  );
}

export function useFeaturedVenue() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      if (cancelled) return;
      setVenue((data as Venue) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { venue, loading };
}

export function useEditorsPicks(limit = 8) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('venues')
        .select('*')
        .eq('is_featured', true)
        .neq('data_source', 'refuge-restrooms')
        .neq('review_status', 'archived')
        .is('duplicate_of_id', null)
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (cancelled) return;
      setVenues((data as Venue[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);
  return { venues, loading };
}

export function useCityLeaderboard(cityId: string | null, limit = 5) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setLoading(true);
    (async () => {
      // The venue_leaderboard_* mat views are not API-exposed (linter 0016);
      // rpc_venue_leaderboard is the SECURITY DEFINER gateway.
      const { data } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'rpc_venue_leaderboard' as any,
        { p_city_id: cityId, p_limit: limit },
      );
      const lb = (data as Array<Omit<LeaderboardRow, 'display_name' | 'avatar_url'>>) ?? [];
      const map = await hydrateProfiles(lb);
      if (cancelled) return;
      setRows(
        lb.map((r) => ({
          ...r,
          display_name: map.get(r.user_id)?.display_name ?? null,
          avatar_url: map.get(r.user_id)?.avatar_url ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cityId, limit]);
  return { rows, loading };
}

export function useGlobalLeaderboard(limit = 100) {
  return useCityLeaderboard(null, limit);
}

export function useDiscoveryProfile() {
  const { user } = useAuth();
  const [data, setData] = useState<{
    categories?: string[];
    tags?: string[];
    target_groups?: string[];
    primary_city_id?: string;
    primary_city_name?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: row } = await supabase
        .from('profiles')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('discovery_profile' as any)
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setData(((row as { discovery_profile?: unknown } | null)?.discovery_profile as typeof data) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);
  return { data, loading };
}

export async function saveDiscoveryProfile(userId: string, dp: Record<string, unknown>) {
  return supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ discovery_profile: dp } as any)
    .eq('user_id', userId);
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
  const [venues, setVenues] = useState<VisitedVenue[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setVenues([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: checkins } = await supabase
        .from('venue_checkins')
        .select('venue_id, checked_in_at')
        .eq('user_id', user.id)
        .order('checked_in_at', { ascending: false });
      const seen = new Map<string, string>();
      for (const c of (checkins as Array<{ venue_id: string; checked_in_at: string }>) ?? []) {
        if (!seen.has(c.venue_id)) seen.set(c.venue_id, c.checked_in_at);
      }
      const ids = Array.from(seen.keys());
      if (ids.length === 0) {
        if (!cancelled) {
          setVenues([]);
          setLoading(false);
        }
        return;
      }
      const { data: vs } = await supabase
        .from('venues')
        .select('id, name, slug, city, country, images')
        .in('id', ids);
      if (cancelled) return;
      const list: VisitedVenue[] = ((vs as Array<Omit<VisitedVenue, 'last_checkin'>>) ?? [])
        .map((v) => ({ ...v, last_checkin: seen.get(v.id) ?? '' }))
        .sort((a, b) => b.last_checkin.localeCompare(a.last_checkin));
      setVenues(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);
  return { venues, loading };
}

export function useCityAutocomplete(query: string) {
  const [matches, setMatches] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (query.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setMatches([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('cities')
        .select('id, name')
        .ilike('name', `%${query}%`)
        .limit(5);
      if (!cancelled) setMatches((data as Array<{ id: string; name: string }>) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);
  return matches;
}
