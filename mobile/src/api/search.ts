import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { withOfflineFallback } from '@/features/packs/offline';
import { searchEvents as searchEventsOffline, searchVenues as searchVenuesOffline } from '@/features/packs/store';
import { supabase } from '@/lib/supabase';

/**
 * Search over places and events. Online it goes to the same search-proxy
 * worker the web uses (Postgres hybrid search); when that request fails,
 * downloaded city packs answer from their FTS5 indexes — places, and events
 * not over yet. One hook, so the screen does not care which.
 */
export const SEARCH_URL = process.env.EXPO_PUBLIC_SEARCH_URL ?? 'https://search.queer.guide';
export const MIN_QUERY = 2;

export type HitKind = 'venue' | 'event';

export interface SearchHit {
  kind: HitKind;
  slug: string;
  name: string;
  /** venue category or event type; both are free slugs the screen translates */
  category: string | null;
  city: string | null;
}

export interface SearchResult {
  hits: SearchHit[];
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
  /** epoch seconds */
  start_date?: number | null;
  end_date?: number | null;
}

const DAY_S = 86_400;

/**
 * An event is worth showing until it is over. The index holds tens of
 * thousands of past events (archive imports), so a search for "pride" would
 * otherwise be mostly last decade. No end date: assume it ends within a day.
 */
export function eventStillOn(h: Pick<ProxyHit, 'start_date' | 'end_date'>, nowMs = Date.now()) {
  const end = h.end_date ?? (h.start_date != null ? h.start_date + DAY_S : null);
  return end != null && end * 1000 >= nowMs;
}

/** Keep hits that can actually be opened: a venue or a not-yet-over event with a slug and a name. */
export function toHits(raw: ProxyHit[], nowMs = Date.now()): SearchHit[] {
  return raw.flatMap((h): SearchHit[] => {
    const name = h.name ?? h.title;
    if (!h.slug || !name) return [];
    if (h.type === 'venue') {
      return [{ kind: 'venue' as const, slug: h.slug, name, category: h.category ?? null, city: h.city ?? null }];
    }
    if (h.type === 'event' && eventStillOn(h, nowMs)) {
      return [{ kind: 'event' as const, slug: h.slug, name, category: h.category ?? null, city: h.city ?? null }];
    }
    return [];
  });
}

export async function searchOnline(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
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
      body: JSON.stringify({ query, hitsPerPage: 30, filters: { types: ['venue', 'event'] } }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (!res.ok) throw new Error(`search ${res.status}`);
  const body = (await res.json()) as { hits?: ProxyHit[] };
  return toHits(body.hits ?? []);
}

export function search(query: string, signal?: AbortSignal): Promise<SearchResult> {
  return withOfflineFallback<SearchResult>(
    async () => ({ hits: await searchOnline(query, signal), offline: false }),
    async (db) => {
      const hits: SearchHit[] = [
        ...(await searchVenuesOffline(db, query)).map((v) => ({ kind: 'venue' as const, ...v })),
        ...(await searchEventsOffline(db, query)).map((e) => ({ kind: 'event' as const, ...e })),
      ];
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

export function useSearch(input: string) {
  const query = useDebounced(input.trim(), 250);
  return useQuery({
    queryKey: ['search', query],
    queryFn: ({ signal }) => search(query, signal),
    enabled: query.length >= MIN_QUERY,
    staleTime: 5 * 60_000,
    retry: 0,
    placeholderData: (prev) => prev,
  });
}
