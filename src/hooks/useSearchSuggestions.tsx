import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapPin, Calendar, Store, Tag, Users, User, Newspaper, Globe } from 'lucide-react';
import { fetchAutocomplete, type SearchHit } from '@/lib/searchClient';
import { toIndexKeys } from '@/lib/searchTaxonomy';

const MIN_QUERY_LEN = 2;
const MAX_PER_TYPE = 2;
const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 150;

export interface SearchSuggestion {
  id: string;
  name: string;
  type: string;
  icon: React.ComponentType;
  subtitle?: string;
  title?: string;
  /** Meili-highlighted HTML, e.g. "Ber<em>lin</em>". When present, prefer over client-side highlighting. */
  nameHtml?: string;
  slug?: string;
  city?: string;
  country?: string;
}

export const TYPE_ICONS: Record<string, React.ComponentType> = {
  venue: MapPin,
  event: Calendar,
  marketplace: Store,
  tag: Tag,
  personality: User,
  city: Globe,
  country: Globe,
  queer_village: MapPin,
  news: Newspaper,
  user: Users,
  group: Users,
};

function dedupeAndCap(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const typeCounts: Record<string, number> = {};
  const out: SearchHit[] = [];

  for (const h of hits) {
    const t = h.type || 'unknown';
    const key = t === 'event' ? `event:${h.title}:${h.city}` : `${t}:${h.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    typeCounts[t] = (typeCounts[t] || 0) + 1;
    if (typeCounts[t] > MAX_PER_TYPE) continue;

    out.push(h);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

export function useSearchSuggestions(query: string, scopeTypes?: string[]) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const indexKeys = useMemo(
    () => (scopeTypes && scopeTypes.length > 0 ? toIndexKeys(scopeTypes) : undefined),
    [scopeTypes],
  );
  const indexKeysKey = JSON.stringify(indexKeys ?? null);

  const fetchSuggestions = useCallback(
    async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const hits = await fetchAutocomplete(searchTerm, indexKeys, 12);
      const capped = dedupeAndCap(hits);

      const mapped: SearchSuggestion[] = capped.map((hit) => ({
        id: hit.id || '',
        name: (hit.title || hit.name || '') as string,
        type: hit.type,
        icon: TYPE_ICONS[hit.type] || Tag,
        subtitle: hit.type === 'country' ? undefined
          : hit.type === 'city' ? (hit.country as string | undefined)
          : (hit.city as string | undefined),
        title: (hit.title || hit.name || '') as string,
        nameHtml: (hit.title_formatted as string | null | undefined) ?? undefined,
        slug: hit.slug as string | undefined,
        city: hit.city,
        country: hit.country as string | undefined,
      }));

      setSuggestions(mapped);
    } catch (err) {
      // Autocomplete is a non-critical enhancement layer — a transient blip
      // (network glitch, brief 5xx) should not surface a big red banner that
      // makes search look broken. Drop suggestions silently; the user can
      // still submit and /search has its own (more conservative) error UI.
      console.error('Error fetching suggestions:', err);
      setSuggestions([]);
      setError(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKeysKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(query);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, fetchSuggestions]);

  return { suggestions, loading, error };
}
