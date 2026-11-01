import { useQuery } from '@tanstack/react-query';
import type { Database } from '@db/types';
import { supabase } from '@/lib/supabase';

type VenueRow = Database['public']['Tables']['venues']['Row'];

/** Columns the map and list need. Narrow on purpose: venues has ~100 columns. */
export const VENUE_LIST_COLUMNS =
  'id, slug, name, category, latitude, longitude, city, address, is_featured' as const;

export const VENUE_DETAIL_COLUMNS =
  'id, slug, name, category, latitude, longitude, city, country, address, description, website, phone, instagram, images, tags, accessibility_attributes' as const;

export type VenueListItem = Pick<
  VenueRow,
  'id' | 'slug' | 'name' | 'category' | 'latitude' | 'longitude' | 'city' | 'address' | 'is_featured'
>;

export type VenueDetail = Pick<
  VenueRow,
  | 'id'
  | 'slug'
  | 'name'
  | 'category'
  | 'latitude'
  | 'longitude'
  | 'city'
  | 'country'
  | 'address'
  | 'description'
  | 'website'
  | 'phone'
  | 'instagram'
  | 'images'
  | 'tags'
  | 'accessibility_attributes'
>;

/** [west, south, east, north] — the same order MapLibre RN reports. */
export type Bounds = [number, number, number, number];

/**
 * Every venue read starts here. The predicate is identical to the web's
 * `fetchVenuesPage` (src/hooks/useVenues.tsx): no Refuge Restrooms rows,
 * nothing archived, merged-away or closed.
 */
export function publicVenues<C extends string>(columns: C) {
  return supabase
    .from('venues')
    .select(columns)
    .neq('data_source', 'refuge-restrooms')
    .neq('review_status', 'archived')
    .is('duplicate_of_id', null)
    .is('closed_at', null);
}

/** Round to ~1 km so small pans reuse the cached query instead of refetching. */
export function snapBounds([w, s, e, n]: Bounds, step = 0.01): Bounds {
  const down = (v: number) => Math.floor(v / step) * step;
  const up = (v: number) => Math.ceil(v / step) * step;
  return [down(w), down(s), up(e), up(n)].map((v) => Number(v.toFixed(4))) as Bounds;
}

export const MAX_MAP_VENUES = 500;

export async function fetchVenuesInBounds(bounds: Bounds): Promise<VenueListItem[]> {
  const [west, south, east, north] = bounds;
  const { data, error } = await publicVenues(VENUE_LIST_COLUMNS)
    .gte('latitude', south)
    .lte('latitude', north)
    .gte('longitude', west)
    .lte('longitude', east)
    .order('is_featured', { ascending: false })
    .limit(MAX_MAP_VENUES);
  if (error) throw error;
  return (data ?? []) as VenueListItem[];
}

export async function fetchVenueBySlug(slug: string): Promise<VenueDetail | null> {
  const { data, error } = await publicVenues(VENUE_DETAIL_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data as VenueDetail | null) ?? null;
}

export const venueKeys = {
  bounds: (b: Bounds) => ['venues', 'bounds', ...b] as const,
  detail: (slug: string) => ['venues', 'detail', slug] as const,
};

export function useVenuesInBounds(bounds: Bounds | null) {
  const snapped = bounds ? snapBounds(bounds) : null;
  return useQuery({
    queryKey: snapped ? venueKeys.bounds(snapped) : ['venues', 'bounds', 'none'],
    queryFn: () => fetchVenuesInBounds(snapped!),
    enabled: snapped != null,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useVenue(slug: string) {
  return useQuery({
    queryKey: venueKeys.detail(slug),
    queryFn: () => fetchVenueBySlug(slug),
    staleTime: 10 * 60_000,
  });
}
