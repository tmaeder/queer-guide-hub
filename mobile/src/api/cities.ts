import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { EVENT_LIST_COLUMNS, endsAtOrAfter, rankUpcoming, type EventListItem } from './events';
import { publicVenues, VENUE_LIST_COLUMNS, type VenueListItem } from './venues';

export interface CityDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  country: { name: string; code: string } | null;
}

const CITY_COLUMNS = 'id, slug, name, description, duplicate_of_id, country:countries!country_id(name, code)';

interface CityRow extends CityDetail {
  duplicate_of_id: string | null;
}

/**
 * A city by slug. A merged-away row (e.g. an exonym duplicate) points at its
 * survivor, so an old link still lands on the right city — the same rule the
 * web's slug redirects follow.
 */
export async function fetchCityBySlug(slug: string): Promise<CityDetail | null> {
  let { data, error } = await supabase.from('cities').select(CITY_COLUMNS).eq('slug', slug).maybeSingle();
  if (error) throw error;
  let row = data as unknown as CityRow | null;
  for (let hops = 0; row?.duplicate_of_id && hops < 5; hops++) {
    ({ data, error } = await supabase.from('cities').select(CITY_COLUMNS).eq('id', row.duplicate_of_id).maybeSingle());
    if (error) throw error;
    row = data as unknown as CityRow | null;
  }
  if (!row || row.duplicate_of_id) return null;
  const { duplicate_of_id: _dup, ...city } = row;
  return city;
}

export const CITY_VENUE_LIMIT = 200;
export const CITY_EVENT_LIMIT = 50;

export async function fetchCityVenues(cityId: string): Promise<VenueListItem[]> {
  const { data, error } = await publicVenues(VENUE_LIST_COLUMNS)
    .eq('city_id', cityId)
    .order('is_featured', { ascending: false })
    .order('name')
    .limit(CITY_VENUE_LIMIT);
  if (error) throw error;
  return (data ?? []) as VenueListItem[];
}

/** The events feed's predicate (see fetchEventsInBounds), scoped to one city. */
export async function fetchCityEvents(cityId: string, now = new Date()): Promise<EventListItem[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_LIST_COLUMNS)
    .eq('city_id', cityId)
    .eq('status', 'active')
    .is('duplicate_of_id', null)
    .eq('series_next', true)
    .is('parent_event_id', null)
    .or(endsAtOrAfter(now.toISOString()))
    .order('start_date', { ascending: true })
    .limit(CITY_EVENT_LIMIT);
  if (error) throw error;
  return rankUpcoming((data ?? []) as EventListItem[]);
}

/**
 * How many places/events here are shown only to signed-in members. Counts
 * only — the anon-safe RPC the web's GatedContentNotice uses — so a visitor
 * learns that something exists without learning what or where.
 */
export interface GatedCount {
  count: number;
  /** the country criminalises same-sex relationships; otherwise gating is per listing (e.g. cruising spots) */
  highRisk: boolean;
}

export async function fetchGatedCount(cityId: string): Promise<GatedCount> {
  const { data, error } = await supabase.rpc('gated_count_for_location', { p_city_id: cityId });
  if (error) throw error;
  const c = (data ?? {}) as { venues?: number; events?: number; high_risk?: boolean };
  return { count: (c.venues ?? 0) + (c.events ?? 0), highRisk: c.high_risk === true };
}

export function useCity(slug: string) {
  return useQuery({ queryKey: ['city', slug], queryFn: () => fetchCityBySlug(slug), staleTime: 60 * 60_000 });
}

export function useCityContent(cityId: string | undefined, signedIn: boolean) {
  const venues = useQuery({
    queryKey: ['city', cityId, 'venues'],
    queryFn: () => fetchCityVenues(cityId!),
    enabled: !!cityId,
    staleTime: 10 * 60_000,
  });
  const events = useQuery({
    queryKey: ['city', cityId, 'events'],
    queryFn: () => fetchCityEvents(cityId!),
    enabled: !!cityId,
    staleTime: 10 * 60_000,
  });
  const gated = useQuery({
    queryKey: ['city', cityId, 'gated'],
    queryFn: () => fetchGatedCount(cityId!),
    enabled: !!cityId && !signedIn,
    staleTime: 60 * 60_000,
  });
  return { venues, events, gated };
}
