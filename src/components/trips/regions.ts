/**
 * Minimal country-code → region mapping for /trips/discover region browse.
 * Uses ISO 3166-1 alpha-2 codes. Unknown codes fall through to 'other'.
 *
 * Intentionally hand-curated for travel relevance (Mediterranean is its own
 * bucket inside Europe in the planner's mental model, etc.) — not a strict
 * UN/M.49 mapping.
 */

export type DiscoverRegion =
  | 'europe'
  | 'north_america'
  | 'latin_america'
  | 'asia'
  | 'oceania'
  | 'africa'
  | 'middle_east'
  | 'other';

const REGION_BY_CODE: Record<string, DiscoverRegion> = {
  // Europe
  AT: 'europe', BE: 'europe', BG: 'europe', CH: 'europe', CY: 'europe',
  CZ: 'europe', DE: 'europe', DK: 'europe', EE: 'europe', ES: 'europe',
  FI: 'europe', FR: 'europe', GB: 'europe', GR: 'europe', HR: 'europe',
  HU: 'europe', IE: 'europe', IS: 'europe', IT: 'europe', LT: 'europe',
  LU: 'europe', LV: 'europe', MT: 'europe', NL: 'europe', NO: 'europe',
  PL: 'europe', PT: 'europe', RO: 'europe', SE: 'europe', SI: 'europe',
  SK: 'europe', UA: 'europe', AL: 'europe', BA: 'europe', RS: 'europe',
  ME: 'europe', MK: 'europe',
  // North America
  US: 'north_america', CA: 'north_america', MX: 'north_america',
  // Latin America
  AR: 'latin_america', BR: 'latin_america', CL: 'latin_america',
  CO: 'latin_america', CR: 'latin_america', CU: 'latin_america',
  DO: 'latin_america', EC: 'latin_america', GT: 'latin_america',
  PA: 'latin_america', PE: 'latin_america', PR: 'latin_america',
  UY: 'latin_america', VE: 'latin_america',
  // Asia
  CN: 'asia', HK: 'asia', ID: 'asia', IN: 'asia', JP: 'asia', KH: 'asia',
  KR: 'asia', LK: 'asia', MN: 'asia', MO: 'asia', MY: 'asia', NP: 'asia',
  PH: 'asia', SG: 'asia', TH: 'asia', TW: 'asia', VN: 'asia',
  // Oceania
  AU: 'oceania', NZ: 'oceania', FJ: 'oceania',
  // Africa
  EG: 'africa', GH: 'africa', KE: 'africa', MA: 'africa', NG: 'africa',
  TZ: 'africa', UG: 'africa', ZA: 'africa', SN: 'africa', TN: 'africa',
  // Middle East
  AE: 'middle_east', IL: 'middle_east', JO: 'middle_east', LB: 'middle_east',
  QA: 'middle_east', SA: 'middle_east', TR: 'middle_east',
};

export function regionFromCountry(code: string | null | undefined): DiscoverRegion {
  if (!code) return 'other';
  return REGION_BY_CODE[code.toUpperCase()] ?? 'other';
}

export function regionLabel(region: DiscoverRegion): string {
  switch (region) {
    case 'europe':
      return 'Europe';
    case 'north_america':
      return 'North America';
    case 'latin_america':
      return 'Latin America';
    case 'asia':
      return 'Asia';
    case 'oceania':
      return 'Oceania';
    case 'africa':
      return 'Africa';
    case 'middle_east':
      return 'Middle East';
    case 'other':
      return 'Other';
  }
}

export const REGION_ORDER: DiscoverRegion[] = [
  'europe',
  'north_america',
  'latin_america',
  'asia',
  'oceania',
  'middle_east',
  'africa',
  'other',
];
