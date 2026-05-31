import { useEffect, useState } from 'react';
import { fetchTrending, type SearchHit } from '@/lib/searchClient';

/**
 * Lazy trending fetch — called once when the searchbar first opens with an
 * empty query. Cached in-memory for the rest of the session.
 *
 * Worker returns `entity_type`/`entity_id` shape; we normalize to SearchHit's
 * `type`/`id` so the dropdown can use the same render path as suggestions.
 */
const cache: Record<string, SearchHit[]> = {};
const inflight: Record<string, Promise<SearchHit[]>> = {};

function normalize(raw: Array<Record<string, unknown>>): SearchHit[] {
  return raw
    .map((r) => {
      const type = (r.type as string) || (r.entity_type as string);
      const id = (r.id as string) || (r.entity_id as string);
      if (!type || !id) return null;
      return {
        id,
        type,
        title: r.title as string | undefined,
        name: r.name as string | undefined,
        city: r.city as string | undefined,
        country: r.country as string | undefined,
        slug: r.slug as string | undefined,
      } as SearchHit;
    })
    .filter((x): x is SearchHit => Boolean(x));
}

const DEFAULT_TYPES = ['venue', 'event'];

export function useTrendingSuggestions(
  enabled: boolean,
  limit = 6,
  types: string[] = DEFAULT_TYPES,
): {
  trending: SearchHit[];
  loading: boolean;
} {
  const key = types.join(',');
  const [trending, setTrending] = useState<SearchHit[]>(cache[key] ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (cache[key]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setTrending(cache[key]);
      return;
    }
    setLoading(true);
    const p =
      inflight[key] ??
      (inflight[key] = fetchTrending(key.split(','), undefined, limit)
        .then((hits) => normalize(hits as unknown as Array<Record<string, unknown>>))
        .catch(() => []));
    p.then((hits) => {
      if (cancelled) return;
      cache[key] = hits;
      delete inflight[key];
      setTrending(hits);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, limit, key]);

  return { trending, loading };
}
