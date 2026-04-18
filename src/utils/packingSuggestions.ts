/**
 * Rule-based packing suggestion engine.
 *
 * Produces a list of `{ query, category, reason }` tuples — each query
 * is fired against the Meilisearch `marketplace` index by the caller.
 * Deterministic, free, runs client-side.
 *
 * For smarter / activity-aware suggestions, the PackingTab can upgrade
 * to the `packing-suggestions-llm` edge function on demand.
 */

export type PackingCategory =
  | 'clothing'
  | 'weather'
  | 'toiletries'
  | 'electronics'
  | 'documents'
  | 'safety';

export interface PackingQuery {
  query: string;
  category: PackingCategory;
  reason: string;
  /** Suggested quantity (for checklist default) */
  quantity?: number;
}

export type Hemisphere = 'north' | 'south' | 'equatorial';

export type Season = 'summer' | 'winter' | 'spring' | 'autumn' | 'rainy' | 'dry';

export interface SuggestionInput {
  /** ISO country code (alpha-2) of the destination */
  countryCode: string | null;
  /** Country climate bucket, if known (e.g. from countries.climate) */
  climate?: 'tropical' | 'arid' | 'temperate' | 'continental' | 'polar' | null;
  /** Trip start date (ISO) */
  startDate: string | null;
  /** Trip end date (ISO) */
  endDate: string | null;
  /** Activities derived from trip_places.category, normalized */
  activities?: Array<'beach' | 'hiking' | 'nightlife' | 'business' | 'cultural' | 'food' | 'adventure'>;
  /** LGBTQ+ country equality score (0–10). Low = elevated safety packing */
  equalityScore?: number | null;
}

const SOUTH_HEMI = new Set(['AR','AU','NZ','ZA','CL','UY','PY','BW','ZW','NA','MZ','AO','ID']);
// rough band 15°N – 15°S — we treat as equatorial / year-round warm
const EQUATORIAL = new Set(['CO','EC','PE','BR','KE','UG','TZ','ID','SG','MY','CR','PA','VE']);

export function hemisphereFor(countryCode: string | null): Hemisphere {
  if (!countryCode) return 'north';
  if (EQUATORIAL.has(countryCode)) return 'equatorial';
  if (SOUTH_HEMI.has(countryCode)) return 'south';
  return 'north';
}

export function seasonFor(startDate: string | null, hemisphere: Hemisphere): Season {
  if (!startDate) return 'summer';
  const month = new Date(startDate).getUTCMonth() + 1;
  if (hemisphere === 'equatorial') {
    // loose dry/rainy split — month 6–9 is rainy in many equatorial regions
    return month >= 6 && month <= 9 ? 'rainy' : 'dry';
  }
  const northSummer = month >= 6 && month <= 8;
  const northWinter = month === 12 || month <= 2;
  const northSpring = month >= 3 && month <= 5;
  if (hemisphere === 'north') {
    if (northSummer) return 'summer';
    if (northWinter) return 'winter';
    if (northSpring) return 'spring';
    return 'autumn';
  }
  // southern — invert
  if (northSummer) return 'winter';
  if (northWinter) return 'summer';
  if (northSpring) return 'autumn';
  return 'spring';
}

export function durationDays(start: string | null, end: string | null): number {
  if (!start || !end) return 3;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (isNaN(a) || isNaN(b)) return 3;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/**
 * Generate rule-based packing queries for the marketplace search.
 * Capped at ~15 items to keep panel lightweight.
 */
export function generatePackingSuggestions(input: SuggestionInput): PackingQuery[] {
  const hemi = hemisphereFor(input.countryCode);
  const season = seasonFor(input.startDate, hemi);
  const days = durationDays(input.startDate, input.endDate);
  const activities = input.activities ?? [];
  const isTropical =
    input.climate === 'tropical' || season === 'rainy' || season === 'dry';
  const isCold = season === 'winter' || input.climate === 'polar';
  const isHot = season === 'summer' || isTropical;

  const out: PackingQuery[] = [];

  // ── Clothing — weather-aware ──────────────────────────────────
  out.push({
    query: isCold ? 'merino thermal base layer' : 'travel t-shirt quick dry',
    category: 'clothing',
    reason: isCold ? `Cold ${season}` : `Warm ${season}`,
    quantity: Math.min(10, Math.ceil(days / 2)),
  });
  if (isCold) {
    out.push({
      query: 'packable down jacket',
      category: 'weather',
      reason: 'Insulation for cold weather',
      quantity: 1,
    });
    out.push({
      query: 'warm travel beanie gloves',
      category: 'weather',
      reason: 'Extremities warmth',
      quantity: 1,
    });
  }
  if (isHot) {
    out.push({
      query: 'lightweight linen shirt',
      category: 'clothing',
      reason: 'Breathable for heat',
      quantity: Math.min(5, Math.ceil(days / 3)),
    });
    out.push({
      query: 'packable sun hat',
      category: 'weather',
      reason: 'Sun protection',
      quantity: 1,
    });
  }
  if (season === 'rainy' || season === 'autumn' || season === 'spring') {
    out.push({
      query: 'compact rain jacket',
      category: 'weather',
      reason: `Rain likely in ${season}`,
      quantity: 1,
    });
  }

  // ── Activities ────────────────────────────────────────────────
  if (activities.includes('beach')) {
    out.push({ query: 'quick-dry travel towel', category: 'clothing', reason: 'Beach days', quantity: 1 });
    out.push({ query: 'reef-safe sunscreen SPF 50', category: 'toiletries', reason: 'Beach days', quantity: 1 });
  }
  if (activities.includes('hiking')) {
    out.push({ query: 'hiking boots waterproof', category: 'clothing', reason: 'Hiking planned', quantity: 1 });
    out.push({ query: 'hydration bladder 2L', category: 'clothing', reason: 'Hiking planned', quantity: 1 });
  }
  if (activities.includes('nightlife')) {
    out.push({ query: 'travel dress shoes foldable', category: 'clothing', reason: 'Nightlife', quantity: 1 });
  }
  if (activities.includes('business')) {
    out.push({ query: 'wrinkle-free travel blazer', category: 'clothing', reason: 'Business', quantity: 1 });
  }

  // ── Electronics ───────────────────────────────────────────────
  out.push({
    query: powerAdapterQuery(input.countryCode),
    category: 'electronics',
    reason: 'Travel adapter for destination',
    quantity: 1,
  });
  if (days >= 4) {
    out.push({
      query: 'portable power bank 10000mAh',
      category: 'electronics',
      reason: 'Multi-day battery',
      quantity: 1,
    });
  }

  // ── Toiletries ────────────────────────────────────────────────
  out.push({
    query: 'TSA travel toiletry bottles',
    category: 'toiletries',
    reason: 'Carry-on liquids',
    quantity: 1,
  });

  // ── Safety (LGBTQ+ aware) ─────────────────────────────────────
  const score = input.equalityScore ?? null;
  if (score != null && score < 5) {
    out.push({
      query: 'discreet travel wallet',
      category: 'safety',
      reason: 'Elevated discretion recommended',
      quantity: 1,
    });
  }

  return out.slice(0, 15);
}

function powerAdapterQuery(countryCode: string | null): string {
  if (!countryCode) return 'universal travel adapter';
  // rough plug-type groups
  const typeA = new Set(['US','CA','MX','JP','PH','TW']);
  const typeG = new Set(['GB','IE','MY','SG','HK','MT','CY']);
  const typeI = new Set(['AU','NZ','AR','CN']);
  if (typeA.has(countryCode)) return 'travel adapter type A US plug';
  if (typeG.has(countryCode)) return 'travel adapter type G UK plug';
  if (typeI.has(countryCode)) return 'travel adapter type I AU plug';
  // Europe default — type C/F
  return 'travel adapter type C Europe plug';
}
