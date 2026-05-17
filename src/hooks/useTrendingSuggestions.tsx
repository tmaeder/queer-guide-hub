import { useEffect, useState } from 'react';
import { fetchTrending, type SearchHit } from '@/lib/searchClient';

/**
 * Lazy trending fetch — called once when the searchbar first opens with an
 * empty query. Cached in-memory for the rest of the session.
 */
let cache: SearchHit[] | null = null;
let inflight: Promise<SearchHit[]> | null = null;

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
      (inflight = fetchTrending(['venue', 'event'], undefined, limit).catch(() => []));
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
