/**
 * Equality Score Calculator
 * Calculates a 0-100 score from ILGA LGBTI data stored on country rows.
 * Higher = more equal rights. Used for display and sorting.
 *
 * Tier cutoffs are the single source of truth — getScoreLabel,
 * getScoreRingColor, and src/utils/citiesFilter.tierFor() all derive
 * from EQUALITY_TIER_CUTOFFS so a change here flows everywhere.
 */

export interface EqualityScoreBreakdown {
  score: number;
  label: string;
  color: string;
  bgColor: string;
}

export type EqualityTier =
  | 'very-high'
  | 'high'
  | 'moderate'
  | 'low'
  | 'very-low'
  | 'unknown';

export const EQUALITY_TIERS: readonly EqualityTier[] = [
  'very-high',
  'high',
  'moderate',
  'low',
  'very-low',
  'unknown',
];

/**
 * Score thresholds in descending order. The tier at index i applies when
 * `score >= EQUALITY_TIER_CUTOFFS[i]`. Null/undefined → "unknown".
 */
export const EQUALITY_TIER_CUTOFFS: ReadonlyArray<{ tier: EqualityTier; min: number }> = [
  { tier: 'very-high', min: 80 },
  { tier: 'high', min: 60 },
  { tier: 'moderate', min: 40 },
  { tier: 'low', min: 20 },
  { tier: 'very-low', min: 0 },
];

export const EQUALITY_TIER_LABEL: Record<EqualityTier, string> = {
  'very-high': 'Very High',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  'very-low': 'Very Low',
  unknown: 'No Data',
};

export function tierForScore(score: number | null | undefined): EqualityTier {
  if (score == null) return 'unknown';
  for (const { tier, min } of EQUALITY_TIER_CUTOFFS) {
    if (score >= min) return tier;
  }
  return 'very-low';
}

const TIER_LABEL_COLOR: Record<EqualityTier, { color: string; bgColor: string }> = {
  'very-high': { color: '#15803d', bgColor: '#dcfce7' },
  high: { color: '#65a30d', bgColor: '#ecfccb' },
  moderate: { color: '#ca8a04', bgColor: '#fef9c3' },
  low: { color: '#ea580c', bgColor: '#fff7ed' },
  'very-low': { color: '#dc2626', bgColor: '#fef2f2' },
  unknown: { color: '#6b7280', bgColor: '#f3f4f6' },
};

const TIER_RING_COLOR: Record<EqualityTier, string> = {
  'very-high': '#22c55e',
  high: '#84cc16',
  moderate: '#eab308',
  low: '#f97316',
  'very-low': '#ef4444',
  unknown: '#d1d5db',
};

export function getScoreLabel(score: number | null | undefined): EqualityScoreBreakdown {
  const tier = tierForScore(score);
  const { color, bgColor } = TIER_LABEL_COLOR[tier];
  return {
    score: score ?? 0,
    label: EQUALITY_TIER_LABEL[tier],
    color,
    bgColor,
  };
}

export function getScoreRingColor(score: number | null | undefined): string {
  return TIER_RING_COLOR[tierForScore(score)];
}

/** Parse SSU JSON string to get summary */
export function parseSsuSummary(ssu: string | null | undefined): string {
  if (!ssu) return 'No data';
  try {
    const parsed = JSON.parse(ssu);
    return parsed.summary || 'No data';
  } catch {
    return ssu;
  }
}

/** Parse SSU JSON string to get full details */
export function parseSsuDetails(ssu: string | null | undefined): {
  summary: string;
  marriage: string | null;
  marriage_since: string | null;
  civil_union: string | null;
  civil_union_since: string | null;
} {
  if (!ssu) return { summary: 'No data', marriage: null, marriage_since: null, civil_union: null, civil_union_since: null };
  try {
    const parsed = JSON.parse(ssu);
    return {
      summary: parsed.summary || 'No data',
      marriage: parsed.marriage || null,
      marriage_since: parsed.marriage_since || null,
      civil_union: parsed.civil_union || null,
      civil_union_since: parsed.civil_union_since || null,
    };
  } catch {
    return { summary: ssu, marriage: null, marriage_since: null, civil_union: null, civil_union_since: null };
  }
}

/** Check if a country is criminalized */
export function isCriminalized(crim: Record<string, unknown> | null | undefined): boolean {
  if (!crim) return false;
  return crim.legal === false;
}

/** Check if death penalty applies */
export function hasDeathPenalty(crim: Record<string, unknown> | null | undefined): boolean {
  if (!crim) return false;
  const dp = String(crim.death_penalty || '');
  return dp.includes('Death') || dp === 'Yes';
}

/** Get protection status string for a specific dimension */
export function getProtectionStatus(protection: Record<string, unknown> | null | undefined): {
  so: string;
  gi: string;
  ge: string;
  sc: string;
} {
  if (!protection) return { so: 'No data', gi: 'No data', ge: 'No data', sc: 'No data' };
  return {
    so: String(protection.so || 'No data'),
    gi: String(protection.gi || 'No data'),
    ge: String(protection.ge || 'No data'),
    sc: String(protection.sc || 'No data'),
  };
}
