import { useEffect, useState } from 'react';
import { fetchAutocomplete, type SearchHit } from '@/lib/searchClient';

/**
 * Did-you-mean heuristic: when the main /search returns zero hits but the
 * unscoped /autocomplete (which is typo-tolerant and ignores user filters)
 * has any match, surface the top one as a "Did you mean X?" suggestion.
 *
 * This catches two cases:
 *   1. Typos that /search dropped (Meili's typo tolerance is stricter on
 *      keyword paths than on prefix paths in some configs).
 *   2. Wrong-scope queries — e.g. user has Venues active but the only match
 *      is a City. Suggest the city so they can drop the scope.
 */
export function useDidYouMean(query: string, enabled: boolean) {
  const [hit, setHit] = useState<SearchHit | null>(null);

  useEffect(() => {
    if (!enabled || !query || query.trim().length < 2) {
      setHit(null);
      return;
    }
    let cancelled = false;
    fetchAutocomplete(query, undefined, 3)
      .then((hits) => {
        if (cancelled) return;
        const top = hits.find((h) => (h.title || h.name) && (h.title || h.name) !== query);
        setHit(top ?? null);
      })
      .catch(() => {
        if (!cancelled) setHit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [query, enabled]);

  return hit;
}
