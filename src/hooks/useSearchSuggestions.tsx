import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapPin, Calendar, Store, Tag, Users, User, Newspaper, Globe } from 'lucide-react';
import { fetchAutocomplete, type SearchHit } from '@/lib/searchClient';
import { toIndexKeys } from '@/lib/searchTaxonomy';

const MIN_QUERY_LEN = 2;
const MAX_PER_TYPE_ALL = 4;
const MAX_PER_TYPE_SCOPED = 20;
const MAX_SUGGESTIONS_ALL = 16;
const MAX_SUGGESTIONS_SCOPED = 24;
const FETCH_LIMIT = 32;
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
  image?: string;
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

function pickImage(hit: SearchHit): string | undefined {
  const candidates = [
    hit.image_url,
    hit.cover_image_url,
    hit.hero_image_url,
    hit.primary_image_url,
    hit.photo_url,
    hit.thumbnail_url,
    hit.image,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return undefined;
}

interface DedupedResult {
  hits: SearchHit[];
  countsByType: Record<string, number>;
}

function dedupeAndCap(hits: SearchHit[], scoped: boolean): DedupedResult {
  const seen = new Set<string>();
  const typeCounts: Record<string, number> = {};
  const countsByType: Record<string, number> = {};
  const out: SearchHit[] = [];
  const perType = scoped ? MAX_PER_TYPE_SCOPED : MAX_PER_TYPE_ALL;
  const total = scoped ? MAX_SUGGESTIONS_SCOPED : MAX_SUGGESTIONS_ALL;

  for (const h of hits) {
    const t = h.type || 'unknown';
    const key = t === 'event' ? `event:${h.title}:${h.city}` : `${t}:${h.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    countsByType[t] = (countsByType[t] || 0) + 1;
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    if (typeCounts[t] > perType) continue;

    out.push(h);
    if (out.length >= total) break;
  }
  return { hits: out, countsByType };
}

export function useSearchSuggestions(query: string, scopeTypes?: string[]) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [countsByType, setCountsByType] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoped = !!(scopeTypes && scopeTypes.length > 0);
  const indexKeys = useMemo(
    () => (scoped ? toIndexKeys(scopeTypes!) : undefined),
    [scoped, scopeTypes],
  );
  const indexKeysKey = JSON.stringify(indexKeys ?? null);

  const fetchSuggestions = useCallback(
    async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setCountsByType({});
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const hits = await fetchAutocomplete(searchTerm, indexKeys, FETCH_LIMIT);
      const { hits: capped, countsByType: counts } = dedupeAndCap(hits, scoped);

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
        image: pickImage(hit),
      }));

      setSuggestions(mapped);
      setCountsByType(counts);
    } catch (err) {
      // Autocomplete is a non-critical enhancement layer — a transient blip
      // (network glitch, brief 5xx) should not surface a big red banner that
      // makes search look broken. Drop suggestions silently; the user can
      // still submit and /search has its own (more conservative) error UI.
      console.error('Error fetching suggestions:', err);
      setSuggestions([]);
      setCountsByType({});
      setError(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKeysKey, scoped]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(query);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, fetchSuggestions]);

  return { suggestions, countsByType, loading, error };
}
