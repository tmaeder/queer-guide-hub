import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Tag,
  Users,
  Newspaper,
  Globe,
  Building2,
  CalendarDays,
  ShoppingBag,
} from '@/components/icons';
import { fetchAutocomplete, type SearchHit } from '@/lib/searchClient';
import { toIndexKeys } from '@/lib/searchTaxonomy';
import { useDebounce } from '@/hooks/useDebounce';
import { resolveImageUrl } from '@/utils/resolveImageUrl';

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
  /** Server-highlighted HTML, e.g. "Ber<em>lin</em>". When present, prefer over client-side highlighting. */
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
  // Prefer the R2-mirrored optimized/thumbnail copy (reachable) over the raw
  // external image_url (often hotlink-protected / 404 / ORB-blocked). Suggestion
  // rows render at 48px, so the thumbnail is the right size.
  const resolved = resolveImageUrl({
    imageUrl: (hit.image_url as string) ?? (hit.image as string) ?? null,
    optimizedUrl: (hit.optimized_url as string) ?? null,
    thumbnailUrl: (hit.thumbnail_url as string) ?? null,
    preferThumb: true,
  });
  if (resolved) return resolved;
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

  // Key on the joined scope so a new array identity with the same types
  // does not refire the fetch.
  const scopeKey = scopeTypes?.join(',') ?? '';
  const scoped = scopeKey.length > 0;
  const indexKeys = useMemo(
    () => (scopeKey ? toIndexKeys(scopeKey.split(',')) : undefined),
    [scopeKey],
  );

  const debounced = useDebounce(query, DEBOUNCE_MS);
  const active = !!debounced && debounced.length >= MIN_QUERY_LEN;

  // Request identity changed → enter loading (or clear, below the minimum)
  // during render, so the effect only does the fetch.
  const fetchKey = active ? `${debounced}|${scopeKey}` : null;
  const [prevFetchKey, setPrevFetchKey] = useState<string | null>(null);
  if (fetchKey !== prevFetchKey) {
    setPrevFetchKey(fetchKey);
    setError(null);
    if (fetchKey) {
      setLoading(true);
    } else {
      setSuggestions([]);
      setCountsByType({});
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

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
  }, [active, debounced, indexKeys, scoped]);

  return { suggestions, countsByType, loading, error };
}
