import { supabase } from '@/integrations/supabase/client';
import { resolveEntityImage, isValidImageUrl } from '@/lib/images/resolveEntityImage';

export type DiscoveryKind = 'venue' | 'event';
export interface DiscoveryFilters {
  search: string;
  city: string;
  cityId: string;
  category: string;
  sort: string;
  price: string;
  verified: boolean;
  free: boolean;
  from: string;
  until: string;
}
export const EMPTY_DISCOVERY_FILTERS: DiscoveryFilters = {
  search: '',
  city: '',
  cityId: '',
  category: '',
  sort: '',
  price: '',
  verified: false,
  free: false,
  from: '',
  until: '',
};
export const DISCOVERY_PAGE_SIZE = 8;
export interface DiscoveryItem {
  id: string;
  name: string;
  href: string;
  city: string | null;
  category: string;
  image: string | null;
  isLogo?: boolean;
  start?: string | null;
  free?: boolean;
}

/** One country-scoped page. Filters run before pagination; totals describe the whole result. */
export async function fetchCountryDiscovery(
  kind: DiscoveryKind,
  countryId: string,
  filters: DiscoveryFilters,
  page: number,
) {
  const search = filters.search.replace(/[,%()]/g, ' ').trim();
  const offset = page * DISCOVERY_PAGE_SIZE;
  if (kind === 'venue') {
    let query = supabase
      .from('venues')
      .select('*', { count: 'exact' })
      .eq('country_id', countryId)
      .neq('data_source', 'refuge-restrooms')
      .neq('review_status', 'archived')
      .is('duplicate_of_id', null)
      .is('closed_at', null);
    if (filters.cityId) query = query.eq('city_id', filters.cityId);
    else if (filters.city.trim())
      query = query.ilike('city', `%${filters.city.replace(/[,%()]/g, ' ').trim()}%`);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.price) query = query.eq('price_range', Number(filters.price));
    if (filters.verified) query = query.eq('verified', true);
    if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    query =
      filters.sort === 'name'
        ? query.order('name', { ascending: true })
        : query
            .order('is_featured', { ascending: false })
            .order('created_at', { ascending: false });
    const { data, count, error } = await query
      .order('id')
      .range(offset, offset + DISCOVERY_PAGE_SIZE - 1);
    if (error) throw error;
    const items: DiscoveryItem[] = (data ?? []).map((venue) => {
      const photo = venue.images?.find(isValidImageUrl);
      return {
        id: venue.id,
        name: venue.name,
        href: `/venues/${venue.slug || venue.id}`,
        city: venue.city,
        category: venue.category ?? 'other',
        image: photo ?? venue.logo_url,
        isLogo: !photo && !!venue.logo_url,
      };
    });
    return { items, total: count ?? items.length };
  }

  let query = supabase
    .from('events')
    .select('*', { count: 'exact' })
    .eq('country_id', countryId)
    .eq('status', 'active')
    .is('duplicate_of_id', null);
  if (filters.cityId) query = query.eq('city_id', filters.cityId);
  else if (filters.city.trim())
    query = query.ilike('city', `%${filters.city.replace(/[,%()]/g, ' ').trim()}%`);
  if (filters.category) query = query.eq('event_type', filters.category);
  if (filters.free) query = query.eq('is_free', true);
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  // Include events already under way. A requested range includes every occurrence in it.
  const from = filters.from
    ? new Date(`${filters.from}T00:00:00`).toISOString()
    : new Date().toISOString();
  query = query.or(`end_date.gte.${from},and(end_date.is.null,start_date.gte.${from})`);
  if (filters.until)
    query = query.lte('start_date', new Date(`${filters.until}T23:59:59.999`).toISOString());
  if (!filters.from && !filters.until)
    query = query.eq('series_next', true).is('parent_event_id', null);
  query =
    filters.sort === 'recent'
      ? query.order('created_at', { ascending: false })
      : query.order('start_date', { ascending: filters.sort !== 'date-desc' });
  const { data, count, error } = await query
    .order('id')
    .range(offset, offset + DISCOVERY_PAGE_SIZE - 1);
  if (error) throw error;
  const items: DiscoveryItem[] = (data ?? []).map((event) => ({
    id: event.id,
    name: event.title,
    href: `/events/${event.slug || event.id}`,
    city: event.city,
    category: event.event_type ?? 'other',
    image: resolveEntityImage('event', event).url,
    start: event.start_date,
    free: event.is_free ?? false,
  }));
  return { items, total: count ?? items.length };
}
