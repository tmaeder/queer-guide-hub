import type { MarketplaceFiltersInput } from '@/hooks/useMarketplace';

/**
 * URL codec for marketplace filters — the URL is the single source of
 * truth so chips, the filter sheet, saved searches and back/forward all
 * agree. `sort`, `page` and `occ` are handled by the page, not here.
 */

/** Sentinel used by the price slider for "no ceiling". */
export const PRICE_CEILING = 100000;

export const PRICE_BANDS = [
  { token: '0-25', label: 'Under $25', min: 0, max: 25 },
  { token: '25-75', label: '$25 – 75', min: 25, max: 75 },
  { token: '75-200', label: '$75 – 200', min: 75, max: 200 },
  { token: '200-', label: '$200+', min: 200, max: PRICE_CEILING },
] as const;

/** `"25-75"` → {min:25,max:75}; `"200-"` → {min:200,max:PRICE_CEILING}. */
export function parsePriceToken(token: string): { min: number; max: number } | undefined {
  const m = /^(\d+)-(\d*)$/.exec(token.trim());
  if (!m) return undefined;
  const min = parseInt(m[1], 10);
  const max = m[2] === '' ? PRICE_CEILING : parseInt(m[2], 10);
  if (Number.isNaN(min) || Number.isNaN(max) || max < min) return undefined;
  return { min, max };
}

export function priceToToken(range: { min: number; max: number }): string {
  return range.max >= PRICE_CEILING ? `${range.min}-` : `${range.min}-${range.max}`;
}

const csv = (v: string[] | undefined) => (v && v.length > 0 ? v.join(',') : undefined);
const uncsv = (v: string | null) =>
  v
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

/** Every URL param owned by the filter codec (cleared before re-writing). */
export const FILTER_PARAM_KEYS = [
  'q',
  'dept',
  'cat',
  'type',
  'loc',
  'price',
  'owned',
  'tags',
  'cur',
  'avail',
  'verified',
] as const;

export function parseFiltersFromParams(sp: URLSearchParams): MarketplaceFiltersInput {
  const f: MarketplaceFiltersInput = {};
  // Commas/parens break the websearch tsquery path — same cleanup the old
  // filter panel applied on submit.
  const q = (sp.get('q') || '').replace(/[,()]/g, ' ').trim();
  if (q) f.search = q;
  const dept = sp.get('dept');
  if (dept) f.department = dept;
  const cat = sp.get('cat');
  if (cat) f.subcategory = cat;
  const type = sp.get('type');
  if (type) f.category = type;
  const loc = sp.get('loc');
  if (loc) f.location = loc;
  const price = sp.get('price');
  if (price) f.priceRange = parsePriceToken(price);
  const owned = uncsv(sp.get('owned'));
  if (owned) f.communityOwned = owned;
  const tags = uncsv(sp.get('tags'));
  if (tags) f.tags = tags;
  const cur = sp.get('cur');
  if (cur) f.currency = cur;
  // 'in_stock' is the default; only the explicit sold-out opt-in is encoded.
  f.availability = sp.get('avail') === 'any' ? 'any' : 'in_stock';
  const verified = parseInt(sp.get('verified') || '0', 10);
  if (verified > 0) f.verifiedWithinDays = verified;
  return f;
}

export function filtersToParams(f: MarketplaceFiltersInput): Record<string, string | undefined> {
  return {
    q: f.search?.trim() || undefined,
    dept: f.department || undefined,
    cat: f.subcategory || undefined,
    type: f.category || undefined,
    loc: f.location || undefined,
    price: f.priceRange ? priceToToken(f.priceRange) : undefined,
    owned: csv(f.communityOwned),
    tags: csv(f.tags),
    cur: f.currency || undefined,
    avail: f.availability === 'any' ? 'any' : undefined,
    verified: f.verifiedWithinDays && f.verifiedWithinDays > 0 ? String(f.verifiedWithinDays) : undefined,
  };
}

export function countActiveFilters(f: MarketplaceFiltersInput): number {
  return (
    (f.search ? 1 : 0) +
    (f.category ? 1 : 0) +
    (f.department ? 1 : 0) +
    (f.subcategory ? 1 : 0) +
    (f.location ? 1 : 0) +
    (f.businessType ? 1 : 0) +
    (f.priceRange ? 1 : 0) +
    (f.tags?.length ?? 0) +
    (f.communityOwned?.length ?? 0) +
    (f.currency ? 1 : 0) +
    (f.availability === 'any' ? 1 : 0) +
    (f.verifiedWithinDays && f.verifiedWithinDays > 0 ? 1 : 0)
  );
}

export function hasActiveFilters(f: MarketplaceFiltersInput): boolean {
  return countActiveFilters(f) > 0;
}

/** Attribute tags are namespaced unified_tags slugs (mat-*, occ-*, vibe-*). */
export function isAttributeTag(slug: string): boolean {
  return /^(mat|occ|vibe)-/.test(slug);
}
