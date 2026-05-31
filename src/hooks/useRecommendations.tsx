import { useEffect, useState } from 'react';
import { fetchRecommendations, type SearchHit } from '@/lib/searchClient';

/**
 * Lazy personalized-recommendations fetch for the zero-query search panel
 * (§9.1). Called once when the searchbar opens with an empty query; cached
 * in-memory for the session. Mirrors useTrendingSuggestions, but hits
 * /recommendations (popularity + engagement bias + featured/geo/freshness) and
 * is keyed by (types, city) so a city-scoped panel caches separately.
 *
 * Worker returns the search_documents card shape (objectID/type/…); we normalize
 * to SearchHit so the dropdown reuses the suggestion render path. Fail-soft: an
 * undeployed endpoint or error yields [] and the caller falls back to trending.
 */
const cache: Record<string, SearchHit[]> = {};
const inflight: Record<string, Promise<SearchHit[]>> = {};

function normalize(raw: Array<Record<string, unknown>>): SearchHit[] {
  return raw
    .map((r) => {
      const type = (r.type as string) || (r.entity_type as string);
      const id = (r.objectID as string) || (r.id as string) || (r.entity_id as string);
      if (!type || !id) return null;
      return {
        id,
        objectID: id,
        type,
        title: r.title as string | undefined,
        name: r.title as string | undefined,
        city: r.city as string | undefined,
        country: r.country as string | undefined,
        slug: r.slug as string | undefined,
        category: r.category as string | undefined,
        imageUrl: r.imageUrl as string | undefined,
      } as SearchHit;
    })
    .filter((x): x is SearchHit => Boolean(x));
}

const DEFAULT_TYPES = ['venue', 'event'];

export function useRecommendations(
  enabled: boolean,
  opts: { limit?: number; types?: string[]; city?: string } = {},
): {
  recommendations: SearchHit[];
  loading: boolean;
} {
  const { limit = 6, types = DEFAULT_TYPES, city } = opts;
  const key = `${types.join(',')}|${city ?? ''}`;
  const [recommendations, setRecommendations] = useState<SearchHit[]>(cache[key] ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (cache[key]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setRecommendations(cache[key]);
      return;
    }
    setLoading(true);
    const p =
      inflight[key] ??
      (inflight[key] = fetchRecommendations({ types, city, limit })
        .then((hits) => normalize(hits as unknown as Array<Record<string, unknown>>))
        .catch(() => []));
    p.then((hits) => {
      if (cancelled) return;
      cache[key] = hits;
      delete inflight[key];
      setRecommendations(hits);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, limit, key, city, types]);

  return { recommendations, loading };
}
