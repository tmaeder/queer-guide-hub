import type { EqualityTier } from '@/utils/citiesFilter';

/**
 * Tier words as the /cities surface renders them — on the chip itself and as
 * the accessible name of the tier filter buttons in CitiesControlBar, which
 * need their own label because the chip's aria-label sits on a bare <span>.
 *
 * Its own module rather than a second export from EqualityChip.tsx: a file that
 * exports a constant beside a component loses fast refresh for that component.
 *
 * Deliberately NOT merged with `EQUALITY_TIER_LABEL` in utils/equalityScore.ts.
 * The two maps agree on five of six tiers and differ on `unknown` — 'No data'
 * here, 'No Data' there — and both strings are rendered (the utils one as the
 * i18n fallback on the home city cards). Unifying them is a visible copy
 * change, not a refactor, so it stays a separate decision.
 */
export const TIER_LABEL: Record<EqualityTier, string> = {
  'very-high': 'Very High',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  'very-low': 'Very Low',
  unknown: 'No data',
};
