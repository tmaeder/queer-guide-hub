/**
 * Single source of truth for "entity → detail route" mapping, shared by the
 * search popover (UniversalSearchBar), the results page (SearchResults), and
 * the inline AI card navigation. Keeps the route table from drifting across
 * three call sites.
 */
import { resolveType } from '@/lib/searchTaxonomy';

/** Per-canonical-type href builders. `slug` is already the slug or id. */
export const ROUTE_HREFS: Record<string, (slug: string) => string> = {
  venue: (s) => `/venues/${s}`,
  event: (s) => `/events/${s}`,
  marketplace: (s) => `/marketplace/${s}`,
  personality: (s) => `/personalities/${s}`,
  city: (s) => `/city/${s}`,
  country: (s) => `/country/${s}`,
  // Route is /villages/:slug (NOT /queer-villages — that path 404s).
  queer_village: (s) => `/villages/${s}`,
  news: (s) => `/news/${s}`,
  // NB: `tag` is deliberately NOT here — the glossary route /resources/:tagName
  // is NAME-keyed (fetchTagWithCategories ilike('name', …)), but ROUTE_HREFS
  // builders only receive the slug. Route tags via `tagHref(name)` / hrefForEntity
  // instead, which use the tag's name. (The old /tags/:slug redirect fed the slug
  // into the name lookup and 404'd every multi-word tag.)
  // Groups have no slug — `s` is the group id (SearchResults falls back to objectID).
  group: (s) => `/groups/${s}`,
};

/**
 * Tags resolve to the glossary by NAME, lowercased (the /resources/:tagName page
 * canonicalises case and matches unified_tags.name, not slug).
 */
export function tagHref(name: string): string {
  return `/resources/${encodeURIComponent((name || '').toLowerCase())}`;
}

export interface EntityRef {
  type: string;
  slug?: string | null;
  /** Falls back to the title for the search-query escape hatch. */
  title?: string | null;
  /** Some city hits are actually countries. */
  isCountry?: boolean;
}

/**
 * Resolve a hit/card/suggestion to its detail route. Handles the historic
 * singular/plural type aliases via `resolveType`, the city-is-country case,
 * tags → /resources, and a /search fallback for types without a detail page.
 */
export function hrefForEntity({ type, slug, title, isCountry }: EntityRef): string {
  const id = resolveType(type) ?? type;
  const key = slug || '';
  if (id === 'city' && isCountry) return `/country/${key}`;
  // Tags route by name (see tagHref) — the glossary lookup is name-keyed.
  if (id === 'tag') return tagHref(title || key);
  const build = ROUTE_HREFS[id];
  if (build && key) return build(key);
  // Types without a dedicated detail route (hotels, festivals, travel, …)
  // fall back to a fresh search on the label.
  return `/search?q=${encodeURIComponent(title || key || '')}`;
}
