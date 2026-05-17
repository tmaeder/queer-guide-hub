import { useEffect, useState } from 'react';
import { fetchTrending, type SearchHit } from '@/lib/searchClient';

/**
 * Lazy trending fetch — called once when the searchbar first opens with an
 * empty query. Cached in-memory for the rest of the session.
 *
 * Worker returns `entity_type`/`entity_id` shape; we normalize to SearchHit's
 * `type`/`id` so the dropdown can use the same render path as suggestions.
 */
let cache: SearchHit[] | null = null;
let inflight: Promise<SearchHit[]> | null = null;

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

export function useTrendingSuggestions(enabled: boolean, limit = 6): {
  trending: SearchHit[];
  loading: boolean;
} {
  const [trending, setTrending] = useState<SearchHit[]>(cache ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || cache) return;
    let cancelled = false;
    setLoading(true);
    const p =
      inflight ??
      (inflight = fetchTrending(['venue', 'event'], undefined, limit)
        .then((hits) => normalize(hits as unknown as Array<Record<string, unknown>>))
        .catch(() => []));
    p.then((hits) => {
      if (cancelled) return;
      cache = hits;
      inflight = null;
      setTrending(hits);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, limit]);

  return { trending, loading };
}
