import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { withOfflineFallback } from '@/features/packs/offline';
import { searchVenues as searchVenuesOffline } from '@/features/packs/store';
import { supabase } from '@/lib/supabase';

/**
 * Venue search. Online it goes to the same search-proxy worker the web uses
 * (Postgres hybrid search); when that request fails, downloaded city packs
 * answer from their FTS5 index. One hook, so the screen does not care which.
 */
export const SEARCH_URL = process.env.EXPO_PUBLIC_SEARCH_URL ?? 'https://search.queer.guide';
export const MIN_QUERY = 2;

export interface VenueHit {
  slug: string;
  name: string;
  category: string | null;
  city: string | null;
}

export interface SearchResult {
  hits: VenueHit[];
  /** true when the answer came from a downloaded pack, not the server */
  offline: boolean;
}

interface ProxyHit {
  type?: string;
  slug?: string | null;
  name?: string | null;
  title?: string | null;
  category?: string | null;
  city?: string | null;
}

/** Keep only venue hits that can actually be opened (have a slug and a name). */
export function toVenueHits(raw: ProxyHit[]): VenueHit[] {
  return raw.flatMap((h) => {
    const name = h.name ?? h.title;
    if (h.type !== 'venue' || !h.slug || !name) return [];
    return [{ slug: h.slug, name, category: h.category ?? null, city: h.city ?? null }];
  });
}

export async function searchVenuesOnline(query: string, signal?: AbortSignal): Promise<VenueHit[]> {
  // Safety layer, same as the web: the proxy shows safety-gated places only to
  // a verified signed-in caller, and it trusts the JWT, never a body field.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;

  // Manual controller: AbortSignal.timeout/any are not reliable on Hermes.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  let res: Response;
  try {
    res = await fetch(`${SEARCH_URL}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, hitsPerPage: 30, filters: { type: 'venue' } }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (!res.ok) throw new Error(`search ${res.status}`);
  const body = (await res.json()) as { hits?: ProxyHit[] };
  return toVenueHits(body.hits ?? []);
}

export function searchVenues(query: string, signal?: AbortSignal): Promise<SearchResult> {
  return withOfflineFallback<SearchResult>(
    async () => ({ hits: await searchVenuesOnline(query, signal), offline: false }),
    async (db) => {
      const hits = await searchVenuesOffline(db, query);
      // No pack matched: keep the network error so the screen says "offline",
      // not "no results" — those mean different things.
      return hits.length ? { hits, offline: true } : null;
    },
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useVenueSearch(input: string) {
  const query = useDebounced(input.trim(), 250);
  return useQuery({
    queryKey: ['search', 'venues', query],
    queryFn: ({ signal }) => searchVenues(query, signal),
    enabled: query.length >= MIN_QUERY,
    staleTime: 5 * 60_000,
    retry: 0,
    placeholderData: (prev) => prev,
  });
}
