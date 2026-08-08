/**
 * Types for the categorical rights verdict — the replacement for the 0-100
 * `equality_score`.
 *
 * Lives under supabase/functions/_shared so the nightly ILGA importer (Deno)
 * can compute it in the same UPDATE that writes the legal columns. It is plain
 * ESM/TS and imports fine from src/ too; see the note in
 * src/lib/__tests__/personalityWikidataResolve.test.ts.
 *
 * Why categorical at all — the scalar has three defects that no re-weighting
 * fixes:
 *
 *   1. It opens at 50 and adds, so a country with no ILGA coverage lands
 *      mid-scale. "Measured and mediocre" and "never measured" are the same
 *      number. That is how North Korea reaches 60.
 *   2. A clamped additive sum cannot hold the invariant that matters:
 *      criminalisation is -25 against roughly +52 of available positives, so
 *      a criminalising country CAN score >= 50. The `crim_consistency`
 *      release gate exists solely to catch that at runtime. Here it is in the
 *      type.
 *   3. It is one number for very different lives. `gi` is weighted at half of
 *      `so`; `ge` and `sc` are read by no line of the formula at all;
 *      `requires_surgery` — a sterilisation requirement — contributes zero.
 */

/**
 * Ordered worst-to-best. `unknown` is deliberately OUTSIDE the order: it is
 * not a rank, never sorts into the middle, and is absorbing in aggregation.
 */
export type Verdict =
  | 'criminalized-severe'
  | 'criminalized'
  | 'hostile'
  | 'partial'
  | 'protected'
  | 'unknown';

export const VERDICT_ORDER: Readonly<Record<Verdict, number>> = {
  'criminalized-severe': 0,
  criminalized: 1,
  hostile: 2,
  partial: 3,
  protected: 4,
  // Outside the scale. Compared only via explicit `=== 'unknown'` checks;
  // any code that sorts on this number must exclude unknown first.
  unknown: -1,
};

export type RightsLens = 'general' | 'lgb' | 'trans' | 'intersex';

/**
 * `absent` is a first-class third state and never counts as `negative`.
 *
 * "ILGA says No" is information. "ILGA has no entry" is not. The importer's
 * mappers already preserve the difference — an unmapped protection is written
 * as `{}`, a measured one as `{so:'No'}` — and only the scorer conflated them.
 */
export type Polarity = 'positive' | 'negative' | 'absent';

export interface Evidence {
  /** Stable id, e.g. 'employment.ge' or 'lgr.requires_surgery'. */
  key: string;
  /** Source column, so a reader can audit the claim. */
  column: string;
  polarity: Polarity;
  /** Verbatim source value. Never normalised away. */
  value: string | null;
  /** Year the right took effect, where ILGA records one. */
  since?: string | null;
}

export interface LensVerdict {
  lens: RightsLens;
  verdict: Verdict;
  /** 0..1 — share of this lens's REQUIRED inputs that carry a value. */
  coverage: number;
  /** Display order; the UI renders these rather than a number. */
  evidence: Evidence[];
  /**
   * Facts this dataset does not contain AT ALL. Shipped in v1, not deferred:
   * without it a green trans verdict reads as a promise about a passport
   * check that ILGA never made.
   */
  notCovered: readonly string[];
  /** One line a human can read. Empty only when verdict === 'unknown'. */
  headline: string;
}

export interface RightsProfile {
  /** worstOf(lgb, trans, intersex) — never an average. */
  general: LensVerdict;
  lgb: LensVerdict;
  trans: LensVerdict;
  intersex: LensVerdict;
  /** `lgbti_data_last_updated`, so a caller can show provenance. */
  asOf: string | null;
}

/** The subset of a `countries` row this engine reads. Loosely shaped by ILGA. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CountryLegalRow = Record<string, any>;
