/**
 * Single source of truth for "entity → detail route" mapping, shared by the
 * search popover (UniversalSearchBar), the results page (SearchResults), and
 * the inline AI card navigation. Keeps the route table from drifting across
 * three call sites.
 */
import { resolveType } from '@/lib/searchTaxonomy';
import { isUuid } from '@/lib/uuid';

/**
 * Per-canonical-type href builders for the SLUG-KEYED entity types — the `s`
 * passed in must be a real, non-UUID slug (see `detailHref`). Id-keyed types
 * (group/user) and name-keyed tags are handled directly in `detailHref`, not
 * here, because their canonical key is not a slug.
 */
export const ROUTE_HREFS: Record<string, (slug: string) => string> = {
  venue: (s) => `/venues/${s}`,
  event: (s) => `/events/${s}`,
  marketplace: (s) => `/marketplace/${s}`,
  personality: (s) => `/personalities/${s}`,
  city: (s) => `/city/${s}`,
  country: (s) => `/country/${s}`,
  // Route is /villages/:slug (NOT /queer-villages — that path 404s). The
  // village detail page resolves by slug ONLY (no id fallback), so a UUID here
  // would 404 — `detailHref` refuses UUID slugs, which keeps this safe.
  queer_village: (s) => `/villages/${s}`,
  news: (s) => `/news/${s}`,
  organization: (s) => `/organizations/${s}`,
  hotel: (s) => `/hotels/${s}`,
  // NB: `tag` is deliberately NOT here — the glossary route /resources/:tagName
  // is NAME-keyed (fetchTagWithCategories ilike('name', …)), but ROUTE_HREFS
  // builders only receive the slug. Route tags via `tagHref(name)` / hrefForEntity
  // instead, which use the tag's name. (The old /tags/:slug redirect fed the slug
  // into the name lookup and 404'd every multi-word tag.)
  // Groups/users are id-keyed (no slug) — handled in `detailHref`, not here.
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
  /** The entity id. Canonical for id-keyed types (group/user); NEVER used as a
   * slug for slug-keyed types (that would fabricate a `/type/<uuid>` dead link). */
  id?: string | null;
  /** Falls back to the title for the search-query escape hatch / tag name. */
  title?: string | null;
  /** Some city hits are actually countries. */
  isCountry?: boolean;
}

/** Id-keyed types — the canonical key is the entity id, not a slug. */
const ID_KEYED: Record<string, (id: string) => string> = {
  group: (i) => `/groups/${i}`,
  user: (i) => `/user/${i}`,
};

/**
 * Strict resolver: return a detail-route href ONLY when the ref carries a
 * canonical key that lands on existing content, else `null` so callers can
 * DROP the item rather than fabricate a link that 404s.
 *
 * - slug-keyed types (venue/event/city/country/personality/news/queer_village/
 *   marketplace/organization/hotel): require a non-empty, non-UUID slug.
 * - id-keyed types (group/user): link by id (accepts `id`, or `slug` carrying
 *   the id — some call sites pass the id in the slug field).
 * - tags: name-keyed via `tagHref`.
 * - `city` + `isCountry` → /country/:slug.
 */
export function detailHref({ type, slug, id, title, isCountry }: EntityRef): string | null {
  const raw = (type || '').trim();
  const canonical = resolveType(type) ?? raw;

  // Tags route by NAME (the /resources glossary lookup is name-keyed).
  if (canonical === 'tag') {
    const name = (title || slug || '').trim();
    return name ? tagHref(name) : null;
  }

  // Id-keyed types have no slug — the id is the canonical key. Match the RAW
  // type first: `resolveType` folds the legacy `user` alias into `personality`,
  // so checking raw keeps community-user hits routing to /user/:id.
  const idBuild = ID_KEYED[raw] ?? ID_KEYED[canonical];
  if (idBuild) {
    const key = (id || slug || '').trim();
    return key ? idBuild(key) : null;
  }

  // Slug-keyed types: require a real, canonical slug. Reject empty slugs and
  // UUID-shaped values (an id leaked into the slug field) — linking those
  // yields a non-canonical URL that 404s on slug-only detail pages.
  const s = (slug || '').trim();
  if (!s || isUuid(s)) return null;
  if (canonical === 'city' && isCountry) return `/country/${s}`;
  const build = ROUTE_HREFS[canonical];
  return build ? build(s) : null;
}

/**
 * Resolve a hit/card/suggestion to a navigable route. Wraps `detailHref` and,
 * when no canonical detail link exists (missing slug, unknown type, …), falls
 * back to a fresh search on the label — which always points at existing
 * content — instead of a fabricated `/type/<uuid>` link.
 */
export function hrefForEntity(ref: EntityRef): string {
  return (
    detailHref(ref) ??
    `/search?q=${encodeURIComponent(ref.title || ref.slug || '')}`
  );
}
