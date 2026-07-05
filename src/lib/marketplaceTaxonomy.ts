// Marketplace browse taxonomy — client mirror of the SQL umbrellas.
// Department umbrellas mirror public.marketplace_department() (migration
// 20260609000000); attribute namespaces mirror _shared/marketplace-normalize.ts.
// Keep the three in sync.

export const DEPARTMENT_LABELS: Record<string, string> = {
  apparel: 'Apparel',
  underwear: 'Underwear',
  swimwear: 'Swimwear',
  jewelry: 'Jewelry',
  books_art: 'Books & Art',
  hygiene: 'Hygiene & Care',
  intimacy: 'Intimacy',
  bdsm_fetish: 'BDSM & Fetish',
  services: 'Services',
  other: 'Other',
};

/** Browse order: SFW-friendly departments first, adult umbrellas last. */
export const DEPARTMENT_ORDER = [
  'apparel', 'underwear', 'swimwear', 'jewelry', 'books_art', 'hygiene',
  'intimacy', 'bdsm_fetish', 'services', 'other',
] as const;

/** Departments entirely made of adult/explicit fine buckets (hidden in default-SFW browse). */
export const ADULT_DEPARTMENTS = new Set(['intimacy', 'bdsm_fetish']);

const SUBCAT_TO_DEPARTMENT: Record<string, string> = {
  sex_toys: 'intimacy',
  anal_toys: 'intimacy',
  cock_rings_and_stretchers: 'intimacy',
  pumps_and_enlargement: 'intimacy',
  chastity: 'intimacy',
  bdsm_and_bondage: 'bdsm_fetish',
  fetish_wear: 'bdsm_fetish',
  fetish_gear: 'bdsm_fetish',
  pup_and_pet_play: 'bdsm_fetish',
  underwear_and_swimwear: 'underwear',
  underwear: 'underwear',
  lingerie: 'underwear',
  swimwear: 'swimwear',
  apparel_and_accessories: 'apparel',
  apparel: 'apparel',
  accessories: 'apparel',
  jewelry_and_pins: 'jewelry',
  jewelry: 'jewelry',
  books_and_art: 'books_art',
  books: 'books_art',
  art: 'books_art',
  hygiene_and_care: 'hygiene',
  hygiene: 'hygiene',
  mental_health: 'services',
  personal_training: 'services',
  event_planning: 'services',
};

export function departmentOf(subcategorySlug: string | null | undefined): string {
  if (!subcategorySlug) return 'other';
  return SUBCAT_TO_DEPARTMENT[subcategorySlug] ?? 'other';
}

export function departmentLabel(slug: string | null | undefined): string {
  return DEPARTMENT_LABELS[slug ?? ''] ?? 'Other';
}

// ── Fine buckets (subcategory_group) — mirror public.marketplace_subcategory_group()
// (migration 20260704120000). Each department's canonical groups, in display order,
// drive the finer sub-tiles on a department page. Keep in sync with the SQL classifier.
export const DEPARTMENT_GROUPS: Record<string, string[]> = {
  apparel: ['tops', 'bottoms', 'outerwear', 'bodywear', 'footwear', 'headwear', 'socks', 'accessories'],
  underwear: ['underwear', 'jockstraps', 'thongs', 'lingerie'],
  swimwear: ['swimwear'],
  jewelry: ['jewelry'],
  books_art: ['books', 'art'],
  hygiene: ['grooming'],
  intimacy: ['sex_toys', 'dildos', 'anal_toys', 'masturbators', 'vibrators', 'cock_rings', 'chastity', 'pumps', 'lubes', 'poppers', 'safer_sex'],
  bdsm_fetish: ['fetish_gear', 'bondage', 'impact_play', 'harnesses', 'collars', 'gags', 'hoods_masks', 'pup_play'],
  services: ['services'],
};

export const GROUP_LABELS: Record<string, string> = {
  tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear', bodywear: 'Bodywear',
  footwear: 'Footwear', headwear: 'Headwear', socks: 'Socks', accessories: 'Accessories',
  underwear: 'Underwear', jockstraps: 'Jockstraps', thongs: 'Thongs', lingerie: 'Lingerie',
  swimwear: 'Swimwear', jewelry: 'Jewelry', books: 'Books', art: 'Art', grooming: 'Grooming',
  sex_toys: 'Sex toys', dildos: 'Dildos', anal_toys: 'Anal toys', masturbators: 'Masturbators',
  vibrators: 'Vibrators', cock_rings: 'Cock rings', chastity: 'Chastity', pumps: 'Pumps',
  lubes: 'Lubes', poppers: 'Poppers', safer_sex: 'Safer sex',
  fetish_gear: 'Fetish gear', bondage: 'Bondage', impact_play: 'Impact play',
  harnesses: 'Harnesses', collars: 'Collars', gags: 'Gags', hoods_masks: 'Hoods & masks',
  pup_play: 'Pup & pet play', services: 'Services',
};

export function groupLabel(slug: string | null | undefined): string {
  if (!slug) return 'Other';
  return GROUP_LABELS[slug] ?? slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Brand routing ─────────────────────────────────────────────────────────────
// Mirror of SQL marketplace_brand_slug(marketplace_normalize_brand(brand))
// (migration 20260702150000). Keep the two in sync.
export function brandSlug(brand: string | null | undefined): string | null {
  if (!brand) return null;
  // Deliberately NOT the shared @/lib/slugify (which folds accents) — this
  // must stay byte-identical to the SQL slug rule in marketplace_department()
  // (migration 20260609000000) or brand URLs stop matching their DB slugs.
  const slug = brand.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || null;
}

// ── Attribute facets (material / occasion / vibe) ────────────────────────────
// unified_tags slugs are namespaced (mat-cotton, occ-pride, vibe-minimal) so they
// can't collide with the global tag vocabulary; labels come from unified_tags.name.
export type MarketplaceAttributeKind = 'material' | 'occasion' | 'vibe';

export const ATTRIBUTE_KIND_LABELS: Record<MarketplaceAttributeKind, string> = {
  material: 'Material',
  occasion: 'Occasion',
  vibe: 'Vibe',
};

/** One-tap browse chips (occasion axis). Slugs are unified_tags slugs. */
export const OCCASION_CHIPS: Array<{ slug: string; label: string }> = [
  { slug: 'occ-pride', label: 'Pride' },
  { slug: 'occ-drag', label: 'Drag' },
  { slug: 'occ-wedding', label: 'Wedding' },
  { slug: 'occ-everyday', label: 'Everyday' },
];
