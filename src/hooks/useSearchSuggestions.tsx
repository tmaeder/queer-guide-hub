import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Tag, Users, Newspaper, Globe, Building2, CalendarDays, ShoppingBag } from 'lucide-react';
import { fetchAutocomplete, type SearchHit } from '@/lib/searchClient';
import { toIndexKeys } from '@/lib/searchTaxonomy';
import { useDebounce } from '@/hooks/useDebounce';

const MIN_QUERY_LEN = 2;
const MAX_PER_TYPE_ALL = 4;
const MAX_PER_TYPE_SCOPED = 20;
const MAX_SUGGESTIONS_ALL = 16;
const MAX_SUGGESTIONS_SCOPED = 24;
const FETCH_LIMIT = 32;
const DEBOUNCE_MS = 160;

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

// Icon set shared with SearchScopeChips — distinct, recognizable glyphs per type.
export const TYPE_ICONS: Record<string, React.ComponentType> = {
  venue: Building2,
  event: CalendarDays,
  marketplace: ShoppingBag,
  tag: Tag,
  personality: Users,
  city: Globe,
  country: Globe,
  queer_village: MapPin,
  news: Newspaper,
  user: Users,
  group: Users,
};

const IMAGE_KEYS = [
  'image_url',
  'cover_image_url',
  'hero_image_url',
  'primary_image_url',
  'photo_url',
  'thumbnail_url',
  'image',
] as const;

function pickImage(hit: SearchHit): string | undefined {
  for (const k of IMAGE_KEYS) {
    const v = hit[k];
    if (typeof v === 'string' && v.length > 0) return v;
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

function mapHit(hit: SearchHit): SearchSuggestion {
  const name = (hit.title || hit.name || '') as string;
  return {
    id: hit.id || '',
    name,
    type: hit.type,
    icon: TYPE_ICONS[hit.type] || Tag,
    subtitle:
      hit.type === 'country'
        ? undefined
        : hit.type === 'city'
          ? (hit.country as string | undefined)
          : (hit.city as string | undefined),
    title: name,
    nameHtml: (hit.title_formatted as string | null | undefined) ?? undefined,
    slug: hit.slug as string | undefined,
    city: hit.city,
    country: hit.country as string | undefined,
    image: pickImage(hit),
  };
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
  // Stable dep for effect — array identity changes shouldn't refire.
  const indexKeysKey = useMemo(() => JSON.stringify(indexKeys ?? null), [indexKeys]);

  const debounced = useDebounce(query, DEBOUNCE_MS);

  useEffect(() => {
    if (!debounced || debounced.length < MIN_QUERY_LEN) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setSuggestions([]);
      setCountsByType({});
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAutocomplete(debounced, indexKeys, FETCH_LIMIT)
      .then((hits) => {
        if (cancelled) return;
        const { hits: capped, countsByType: counts } = dedupeAndCap(hits, scoped);
        setSuggestions(capped.map(mapHit));
        setCountsByType(counts);
      })
      .catch((err) => {
        if (cancelled) return;
        // Autocomplete is a non-critical enhancement layer — a transient blip
        // (network glitch, brief 5xx) should not surface a big red banner.
        console.error('Error fetching suggestions:', err);
        setSuggestions([]);
        setCountsByType({});
        setError(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // indexKeysKey is the stable serialization of indexKeys; safe to depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, indexKeysKey, scoped]);

  return { suggestions, countsByType, loading, error };
}
