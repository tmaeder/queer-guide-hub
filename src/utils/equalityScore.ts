/**
 * Equality Score Calculator
 * Calculates a 0-100 score from ILGA LGBTI data stored on country rows.
 * Higher = more equal rights. Used for display and sorting.
 */

export interface EqualityScoreBreakdown {
  score: number;
  label: string;
  color: string;
  bgColor: string;
}

export function getScoreLabel(score: number | null | undefined): EqualityScoreBreakdown {
  if (score == null) return { score: 0, label: 'No Data', color: '#6b7280', bgColor: '#f3f4f6' };
  if (score >= 80) return { score, label: 'Very High', color: '#15803d', bgColor: '#dcfce7' };
  if (score >= 60) return { score, label: 'High', color: '#65a30d', bgColor: '#ecfccb' };
  if (score >= 40) return { score, label: 'Moderate', color: '#ca8a04', bgColor: '#fef9c3' };
  if (score >= 20) return { score, label: 'Low', color: '#ea580c', bgColor: '#fff7ed' };
  return { score, label: 'Very Low', color: '#dc2626', bgColor: '#fef2f2' };
}

export function getScoreRingColor(score: number | null | undefined): string {
  if (score == null) return '#d1d5db';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return '#eab308';
  if (score >= 20) return '#f97316';
  return '#ef4444';
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
export function isCriminalized(crim: Record<string, any> | null | undefined): boolean {
  if (!crim) return false;
  return crim.legal === false;
}

/** Check if death penalty applies */
export function hasDeathPenalty(crim: Record<string, any> | null | undefined): boolean {
  if (!crim) return false;
  const dp = crim.death_penalty || '';
  return dp.includes('Death') || dp === 'Yes';
}

/** Get protection status string for a specific dimension */
export function getProtectionStatus(protection: Record<string, any> | null | undefined): {
  so: string;
  gi: string;
  ge: string;
  sc: string;
} {
  if (!protection) return { so: 'No data', gi: 'No data', ge: 'No data', sc: 'No data' };
  return {
    so: protection.so || 'No data',
    gi: protection.gi || 'No data',
    ge: protection.ge || 'No data',
    sc: protection.sc || 'No data',
  };
}
