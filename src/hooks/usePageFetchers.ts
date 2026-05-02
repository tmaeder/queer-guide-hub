/**
 * DUP-4 — small page-specific fetchers / mutations extracted out of pages.
 * Grouped here rather than splitting into one hook file per page.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STALE = 5 * 60_000;
const STALE_LONG = 30 * 60_000;

/** HotelDetail.tsx fallback when slug is a uuid. */
export function useHotelByIdFallback<T = unknown>(
  joinSpec: string,
  idOrSlug: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['hotel-by-id-fallback', idOrSlug, joinSpec],
    enabled: enabled && !!idOrSlug,
    staleTime: STALE,
    queryFn: async (): Promise<T | null> => {
      const { data } = await supabase
        .from('hotels')
        .select(joinSpec)
        .eq('id', idOrSlug as string)
        .maybeSingle();
      return (data as T | null) ?? null;
    },
  });
}

/** PersonalityDetail.tsx — fetch country id by name. */
export function useCountryIdByName(name: string | null | undefined) {
  return useQuery({
    queryKey: ['country-id-by-name', name],
    enabled: !!name,
    staleTime: STALE_LONG,
    queryFn: async () => {
      const { data } = await supabase
        .from('countries')
        .select('id')
        .eq('name', name as string)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });
}

/** SubmitForm.tsx — fetch country name by id. */
export async function fetchCountryNameById(id: string): Promise<string | null> {
  const { data } = await supabase.from('countries').select('name').eq('id', id).single();
  return (data?.name as string | undefined) ?? null;
}

/** ProfessionDetail.tsx — list personalities (filtered downstream). */
export function usePersonalitiesByProfession() {
  return useQuery({
    queryKey: ['personalities-with-profession'],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personalities')
        .select('*')
        .not('profession', 'is', null)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** AdminGroups.tsx — delete community group. */
export async function deleteCommunityGroup(id: string) {
  const { error } = await supabase.from('community_groups').delete().eq('id', id);
  return { error };
}

/** AdminMarketplace.tsx — delete marketplace listing. */
export async function deleteMarketplaceListing(id: string) {
  const { error } = await supabase.from('marketplace_listings').delete().eq('id', id);
  return { error };
}

/** AdminRedirects.tsx — fetch full redirect by id. */
export async function fetchRedirectById<T = unknown>(id: string): Promise<T | null> {
  const { data } = await supabase.from('redirects').select('*').eq('id', id).single();
  return (data as T | null) ?? null;
}

/** EventDetail.tsx — upsert attendance. */
export async function upsertEventAttendance(payload: {
  event_id: string;
  user_id: string;
  status: string;
}) {
  const { error } = await supabase.from('event_attendees').upsert(payload);
  return { error };
}

/** AdminReview.tsx — count news_articles in quality review. */
export async function fetchNewsQualityReviewCount(): Promise<number> {
  const { count, error } = await supabase
    .from('news_articles')
    .select('id', { count: 'exact', head: true })
    .eq('quality_status', 'review');
  return error ? 0 : (count ?? 0);
}

/** AdminReview.tsx — count entity_link_review pending rows. */
export async function fetchEntityLinkReviewCount(): Promise<number> {
  // entity_link_review isn't in the generated supabase types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('entity_link_review')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return error ? 0 : (count ?? 0);
}

/** AdminCountries.tsx — delete a country row. */
export async function deleteCountry(id: string) {
  const { error } = await supabase.from('countries').delete().eq('id', id);
  return { error };
}

/** AdminCountries.tsx — update a country row. */
export async function updateCountry(id: string, update: Record<string, unknown>) {
  const { error } = await supabase.from('countries').update(update as never).eq('id', id);
  return { error };
}

/** Friends.tsx — fetch profiles by user_id list. */
export async function fetchProfilesByUserIds<T = unknown>(userIds: string[]): Promise<T[]> {
  if (userIds.length === 0) return [];
  const { data } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url, location')
    .in('user_id', userIds);
  return (data ?? []) as T[];
}

/** News.tsx — bulk lookup helper for cities/countries by id list. */
export async function fetchNamesByIds(
  table: 'cities' | 'countries',
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabase.from(table).select('id, name').in('id', ids);
  const map: Record<string, string> = {};
  (data ?? []).forEach((c: { id: string; name: string }) => {
    map[c.id] = c.name;
  });
  return map;
}

/** AdminPersonalities.tsx — read internal note for a personality. */
export async function fetchPersonalityInternalNote(personalityId: string): Promise<string | null> {
  const { data } = await supabase
    .from('personality_internal_notes' as never)
    .select('notes')
    .eq('personality_id' as never, personalityId as never)
    .maybeSingle();
  return ((data as { notes?: string } | null)?.notes as string | undefined) ?? null;
}

/** AdminPersonalities.tsx — upsert internal note. */
export async function upsertPersonalityInternalNote(payload: {
  personality_id: string;
  notes: string;
  updated_by?: string | null;
}) {
  const { error } = await supabase
    .from('personality_internal_notes' as never)
    .upsert(payload as never, { onConflict: 'personality_id' });
  return { error };
}

/** Favorites.tsx — fetch all favorite types for a user in parallel. */
export async function fetchAllUserFavorites(userId: string) {
  const [venueFavs, eventFavs, marketplaceFavs, newsFavs] = await Promise.all([
    supabase.from('venue_favorites').select('venue_id').eq('user_id', userId),
    supabase.from('event_favorites').select('event_id').eq('user_id', userId),
    supabase.from('marketplace_favorites').select('listing_id').eq('user_id', userId),
    supabase.from('news_favorites').select('article_id').eq('user_id', userId),
  ]);
  const venueIds = venueFavs.data?.map((f) => f.venue_id) ?? [];
  const eventIds = eventFavs.data?.map((f) => f.event_id) ?? [];
  const listingIds = marketplaceFavs.data?.map((f) => f.listing_id) ?? [];
  const articleIds = newsFavs.data?.map((f) => f.article_id) ?? [];

  const [venueData, eventData, marketplaceData, newsData] = await Promise.all([
    venueIds.length
      ? supabase
          .from('venues')
          .select('id, slug, name, description, image_url, location, rating, category')
          .in('id', venueIds)
      : Promise.resolve({ data: [] as unknown[] }),
    eventIds.length
      ? supabase
          .from('events')
          .select(
            'id, slug, title, description, images, city, state, country, start_date, price_min, event_type',
          )
          .in('id', eventIds)
      : Promise.resolve({ data: [] as unknown[] }),
    listingIds.length
      ? supabase
          .from('marketplace_listings')
          .select('id, slug, title, description, images, location, price, category, business_name')
          .in('id', listingIds)
      : Promise.resolve({ data: [] as unknown[] }),
    articleIds.length
      ? supabase
          .from('news_articles')
          .select('id, slug, title, excerpt, image_url, category, published_at, views_count')
          .in('id', articleIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  return {
    venues: (venueData.data ?? []) as Array<Record<string, unknown>>,
    events: (eventData.data ?? []) as Array<Record<string, unknown>>,
    marketplace: (marketplaceData.data ?? []) as Array<Record<string, unknown>>,
    news: (newsData.data ?? []) as Array<Record<string, unknown>>,
  };
}

/** AdminReview.tsx — count rows matching a single filter (or all). */
export function useReviewCount(table: string, filterCol?: string, filterVal?: string) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      type CountResult = { count: number | null; error: unknown };
      const base = supabase.from(table as never).select('id', { count: 'exact', head: true });
      const filtered =
        filterCol && filterVal !== undefined
          ? (base as unknown as { eq: (c: string, v: unknown) => Promise<CountResult> }).eq(
              filterCol,
              filterVal,
            )
          : (base as unknown as Promise<CountResult>);
      const { count: c, error } = await filtered;
      if (!cancelled) {
        setCount(error ? 0 : (c ?? 0));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [table, filterCol, filterVal]);
  return { count, loading };
}
