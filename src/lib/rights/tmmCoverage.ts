import { readTransViolence, type TransViolenceRecord } from './transSafety';
import { hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import type { TransRightsCountry } from '@/hooks/useIntentData';

/**
 * What the TGEU documented-violence counts actually measure.
 *
 * The table these figures introduce is the most misreadable thing on the page:
 * a list of countries ordered by killings reads as a danger ranking, and it is
 * very nearly the inverse of one. This module produces the evidence that says
 * so, in a form a reader can check.
 *
 * MEASURED AND REJECTED — a mean-equality comparison between the countries
 * with documented cases and those without. It looks compelling at first:
 * restricted to countries over a million people, the documented group averages
 * equality 66.2 against 48.9, and 24% of them criminalise against 45%. But the
 * whole effect is the population floor. Across all 250 countries it collapses
 * to 66.1 against 64.3, and 24% against 28% — no story at all. The 89 countries
 * under a million people are mostly small European and Pacific territories with
 * high equality scores and no recorded cases, and they pull the comparison
 * apart.
 *
 * A floor that large is not a detail of method, it IS the finding, and a
 * statistic that only holds inside an undisclosed filter has no business on a
 * page about trusting data. The two figures below need no filter, no floor and
 * no denominator choice, and they make the same point harder:
 *
 *   · 95.8% of every case ever recorded (5,099 of 5,320) is in a country that
 *     does NOT criminalise same-sex acts.
 *   · 45 of the 67 criminalising countries have recorded zero, across eighteen
 *     years of monitoring.
 *
 * Neither is a claim that criminalising countries are safe. Both are a claim
 * about who is in a position to count.
 */

export interface TmmReporting {
  /** Countries with at least one documented case. */
  documentedCountries: number;
  totalCases: number;
  /** Cases recorded in countries that do not criminalise same-sex acts. */
  casesInNonCriminalising: number;
  /** 0-100, rounded. The headline. */
  pctCasesInNonCriminalising: number;
  criminalisingTotal: number;
  /** Criminalising countries with nothing recorded — absence of counting. */
  criminalisingWithNothingRecorded: number;
}

export function summariseTmmReporting(rows: readonly TransRightsCountry[]): TmmReporting {
  let documentedCountries = 0;
  let totalCases = 0;
  let casesInNonCriminalising = 0;
  let criminalisingTotal = 0;
  let criminalisingWithNothingRecorded = 0;

  for (const row of rows) {
    const record = readTransViolence(row.trans_violence_documented);
    const cases = record.state === 'documented' ? (record.total ?? 0) : 0;
    const criminalising = hasAnyCriminalizationSignal(row.lgbti_criminalization);

    if (cases > 0) documentedCountries += 1;
    totalCases += cases;
    if (!criminalising) casesInNonCriminalising += cases;
    if (criminalising) {
      criminalisingTotal += 1;
      if (cases === 0) criminalisingWithNothingRecorded += 1;
    }
  }

  return {
    documentedCountries,
    totalCases,
    casesInNonCriminalising,
    pctCasesInNonCriminalising:
      totalCases > 0 ? Math.round((casesInNonCriminalising / totalCases) * 100) : 0,
    criminalisingTotal,
    criminalisingWithNothingRecorded,
  };
}

// ---------------------------------------------------------------------------
// The table's magnitude bands
// ---------------------------------------------------------------------------

/**
 * MAGNITUDE bands, not severity bands, and the labels have to keep saying so.
 * "100+" is a statement about how many cases were documented; it is not
 * "worst", "high risk" or any other ordinal word, because the countries in it
 * are largely the ones with the strongest trans-led organisations.
 */
export type TmmBand = 'all' | 'latest' | '1-4' | '5-19' | '20-99' | '100+';

export const TMM_BAND_ORDER: readonly TmmBand[] = ['all', 'latest', '1-4', '5-19', '20-99', '100+'];

export const TMM_BAND_LABEL: Record<TmmBand, string> = {
  all: 'All',
  latest: 'In the latest period',
  '1-4': '1–4 cases',
  '5-19': '5–19',
  '20-99': '20–99',
  '100+': '100 or more',
};

export function bandOf(record: TransViolenceRecord): Exclude<TmmBand, 'all' | 'latest'> | null {
  const n = record.total ?? 0;
  if (n <= 0) return null;
  if (n < 5) return '1-4';
  if (n < 20) return '5-19';
  if (n < 100) return '20-99';
  return '100+';
}

export function matchesBand(
  record: TransViolenceRecord,
  band: TmmBand,
  latestPeriod: string | null,
): boolean {
  if (band === 'all') return true;
  if (band === 'latest') {
    return latestPeriod != null && record.byPeriod.some((p) => p.period === latestPeriod);
  }
  return bandOf(record) === band;
}

/**
 * The most recent period ANY country reports, so "in the latest period" means
 * one fixed window rather than each row's own last entry — which would quietly
 * mix TDoR 2025 with a country whose last recorded case was in 2013.
 */
export function latestPeriodOf(records: readonly TransViolenceRecord[]): string | null {
  let latest: string | null = null;
  for (const r of records) {
    for (const p of r.byPeriod) {
      if (latest == null || p.period.localeCompare(latest) > 0) latest = p.period;
    }
  }
  return latest;
}
