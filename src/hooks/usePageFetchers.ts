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
