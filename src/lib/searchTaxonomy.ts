/**
 * Single source of truth for content-type taxonomy used by search UI.
 *
 * Why this exists: filter panel labels (`Venues`), category dropdowns
 * (`venues`), worker INDEX_MAP keys (`venues`), and result hits (`venue` /
 * `venues`) used to disagree, which caused P0-3 (filters silently widened to
 * "all indexes" when an unknown id was sent) and P3-12 (label drift across
 * surfaces).
 *
 * `id` is what the URL/UI uses. `indexKey` is what the worker accepts in
 * `filters.types`. `aliasTypes` covers the historic plurals/singulars the
 * worker may still return on a hit so that post-filtering against a result's
 * `type` field stays correct.
 */
export interface ContentType {
  id: string;
  label: string;
  indexKey: string;
  aliasTypes: string[];
  supportsPriceSort: boolean;
}

export const CONTENT_TYPES: ContentType[] = [
  { id: 'venue', label: 'Venues', indexKey: 'venues', aliasTypes: ['venue', 'venues'], supportsPriceSort: false },
  { id: 'event', label: 'Events', indexKey: 'events', aliasTypes: ['event', 'events'], supportsPriceSort: true },
  { id: 'marketplace', label: 'Marketplace', indexKey: 'marketplace', aliasTypes: ['marketplace'], supportsPriceSort: true },
  { id: 'news', label: 'News', indexKey: 'news', aliasTypes: ['news'], supportsPriceSort: false },
  { id: 'personality', label: 'Personalities', indexKey: 'personalities', aliasTypes: ['personality', 'personalities', 'user'], supportsPriceSort: false },
  { id: 'city', label: 'Cities', indexKey: 'cities', aliasTypes: ['city', 'cities', 'location'], supportsPriceSort: false },
  { id: 'country', label: 'Countries', indexKey: 'countries', aliasTypes: ['country', 'countries'], supportsPriceSort: false },
  { id: 'tag', label: 'Tags', indexKey: 'tags', aliasTypes: ['tag', 'tags', 'content', 'ressource'], supportsPriceSort: false },
  { id: 'queer_village', label: 'Places', indexKey: 'queer_villages', aliasTypes: ['queer_village', 'queer_villages', 'travel'], supportsPriceSort: false },
];

const BY_ID = new Map(CONTENT_TYPES.map((t) => [t.id, t]));
const BY_ALIAS = new Map<string, ContentType>();
for (const t of CONTENT_TYPES) {
  for (const a of t.aliasTypes) BY_ALIAS.set(a, t);
}

export function getContentType(id: string): ContentType | undefined {
  return BY_ID.get(id);
}

/** Resolve a hit's `result.type` (which may be plural, singular, or legacy) to a canonical id. */
export function resolveType(rawType: string | undefined | null): string | null {
  if (!rawType) return null;
  return BY_ALIAS.get(rawType)?.id ?? null;
}

/** Map UI ids → worker indexKeys for the search request body. */
export function toIndexKeys(ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const t = BY_ID.get(id);
    if (t) out.add(t.indexKey);
  }
  return [...out];
}

/** Whether the active type set should display price-based sort options. */
export function supportsPriceSort(typeIds: string[] | undefined): boolean {
  if (!typeIds || typeIds.length === 0) return false; // heterogeneous "all" — hide price.
  return typeIds.every((id) => BY_ID.get(id)?.supportsPriceSort === true);
}
