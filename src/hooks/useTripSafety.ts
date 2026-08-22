import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  getScoreLabel,
  isCriminalized,
  hasDeathPenalty,
  deathPenaltyRisk,
  type DeathPenaltyRisk,
  type EqualityScoreBreakdown,
} from '@/utils/equalityScore';
import { qk } from '@/lib/queryKeys';
import { computeRightsProfile } from '../../supabase/functions/_shared/rights/verdict.ts';
import { VERDICT_ORDER, type Verdict } from '../../supabase/functions/_shared/rights/types.ts';

export interface CountrySafety {
  id: string;
  name: string;
  code: string | null;
  equality_score: number | null;
  scoreBreakdown: EqualityScoreBreakdown;
  criminalized: boolean;
  /** Confirmed only. For warning copy prefer `deathPenaltyRisk`. */
  deathPenalty: boolean;
  deathPenaltyRisk: DeathPenaltyRisk;
  /**
   * Categorical verdict, worst across the LGB/trans/intersex lenses.
   *
   * Computed client-side from this row, NOT read from
   * `countries.rights_verdict_general` — that column exists but is not yet
   * populated (the nightly ILGA cron writes it), so reading it today would
   * make every destination `unknown`.
   *
   * Prefer this over `equality_score` for any comparison or ranking. It has a
   * real `unknown` that stays outside the order, where the score forced
   * callers to invent a number for "we don't know".
   */
  verdict: Verdict;
  lgbti_criminalization: unknown;
  lgbti_employment_protection: unknown;
  lgbti_same_sex_unions: unknown;
  lgbti_adoption_rights: unknown;
  lgbti_conversion_therapy_regulation: unknown;
  /**
   * Already in the fetch above for `computeRightsProfile`; exposed so the
   * briefing can state the one trans-specific fact a traveller acts on — whether
   * their documents can be made to match, and what that costs.
   */
  lgbti_gender_recognition: unknown;
}

export interface CrossBorderWarning {
  from: { name: string; score: number | null };
  to: { name: string; score: number | null };
  scoreDrop: number;
  message: string;
}

/**
 * Whether `overallRisk` means anything yet.
 *
 * `idle`    — no countries asked about; there is nothing to say.
 * `loading` — the fetch is in flight.
 * `error`   — the fetch failed.
 * `ready`   — the verdict below is derived from real rows.
 *
 * This exists because the report's empty shape is `overallRisk: 'low'` with
 * every flag false, which is byte-identical to a country we measured and found
 * safe. `/country/afghanistan` therefore rendered "Welcoming" under its own
 * death-penalty travel warning for the whole fetch window (observed live,
 * ~30s, 2026-08-07). Any surface that states a verdict MUST gate on
 * `status === 'ready'`; a surface that merely hides itself when things look
 * fine is already safe, because absence is not a claim.
 */
export type TripSafetyStatus = 'idle' | 'loading' | 'error' | 'ready';

export interface TripSafetyReport {
  countries: CountrySafety[];
  crossBorderWarnings: CrossBorderWarning[];
  status: TripSafetyStatus;
  /** Only meaningful when `status === 'ready'`. Defaults to 'low' otherwise. */
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';
  hasCriminalizedDestination: boolean;
  /** Confirmed capital penalty. */
  hasDeathPenaltyDestination: boolean;
  /**
   * Confirmed OR recorded-as-possible. Drives `overallRisk === 'critical'`;
   * use this for "should we warn", and the narrower flag above only where the
   * UI states the penalty as established fact.
   */
  hasDeathPenaltyRiskDestination: boolean;
  /**
   * At least one destination has too little recorded law to judge.
   *
   * Surfaced so a caller can say so instead of implying a measurement. It also
   * keeps `overallRisk` off `low`: "we don't know" must never render as "fine".
   */
  hasUnknownDestination: boolean;
}

/**
 * The destination a warning should name.
 *
 * Both callers sorted by `equality_score ?? 100` ascending, which put every
 * unmeasured country LAST and so made it unpickable as the worst — meaning a
 * criminalising destination with no score could be silently swapped for a
 * different country inside a sentence about the death penalty.
 *
 * Ranks by verdict instead. `unknown` sits outside the order, so it is chosen
 * only when there is nothing measured to choose, and the score is used purely
 * to break ties between equal verdicts.
 */
export function worstCountryOf(countries: readonly CountrySafety[]): CountrySafety | undefined {
  if (countries.length === 0) return undefined;
  const measured = countries.filter((c) => c.verdict !== 'unknown');
  const pool = measured.length > 0 ? measured : countries;
  return [...pool].sort((a, b) => {
    const byVerdict = VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict];
    if (byVerdict !== 0) return byVerdict;
    return (
      (a.equality_score ?? Number.POSITIVE_INFINITY) -
      (b.equality_score ?? Number.POSITIVE_INFINITY)
    );
  })[0];
}

export function useTripSafety(countryIds: string[]) {
  const uniqueIds = useMemo(() => [...new Set(countryIds.filter(Boolean))], [countryIds]);

  const {
    data: countries,
    isPending,
    isError,
  } = useQuery({
    queryKey: qk.trip.safetyFor(uniqueIds),
    queryFn: async () => {
      if (uniqueIds.length === 0) return [];
      const { data, error } = await supabase
        .from('countries')
        // Widened to everything the verdict engine reads. A trip is 1-5
        // countries and a country/city page is one, so the extra jsonb costs
        // little; computing a verdict from a partial row would instead read as
        // thin coverage and return `unknown` for places we have measured.
        // ONE string literal, not a concatenation: supabase-js infers the row
        // type from the literal, and a `'a' + 'b'` expression degrades it to
        // GenericStringError, which then fails on every property access.
        .select(
          'id, name, code, equality_score, lgbti_criminalization, lgbti_expression_restrictions, lgbti_association_restrictions, lgbti_constitutional_protection, lgbti_employment_protection, lgbti_housing_protection, lgbti_education_protection, lgbti_health_protection, lgbti_goods_services_protection, lgbti_bullying_protection, lgbti_hate_crime_law, lgbti_incitement_prohibition, lgbti_same_sex_unions, lgbti_adoption_rights, lgbti_conversion_therapy_regulation, lgbti_gender_recognition, lgbti_intersex_protection, lgbti_data_last_updated',
        )
        .in('id', uniqueIds);
      if (error) throw error;
      return data || [];
    },
    enabled: uniqueIds.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  // `idle` must be tested first: with `enabled: false` react-query reports
  // isPending forever, so an empty request would otherwise read as loading.
  const status: TripSafetyStatus =
    uniqueIds.length === 0
      ? 'idle'
      : isError
        ? 'error'
        : isPending || !countries
          ? 'loading'
          : 'ready';

  return useMemo((): TripSafetyReport => {
    if (!countries || countries.length === 0) {
      return {
        countries: [],
        crossBorderWarnings: [],
        status,
        overallRisk: 'low',
        hasCriminalizedDestination: false,
        hasDeathPenaltyDestination: false,
        hasDeathPenaltyRiskDestination: false,
        hasUnknownDestination: false,
      };
    }

    const safetySummaries: CountrySafety[] = countries.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      equality_score: c.equality_score,
      scoreBreakdown: getScoreLabel(c.equality_score),
      criminalized: isCriminalized(c.lgbti_criminalization as Record<string, unknown> | null),
      deathPenalty: hasDeathPenalty(c.lgbti_criminalization as Record<string, unknown> | null),
      deathPenaltyRisk: deathPenaltyRisk(c.lgbti_criminalization as Record<string, unknown> | null),
      verdict: computeRightsProfile(c as Record<string, unknown>).general.verdict,
      lgbti_criminalization: c.lgbti_criminalization,
      lgbti_employment_protection: c.lgbti_employment_protection,
      lgbti_same_sex_unions: c.lgbti_same_sex_unions,
      lgbti_adoption_rights: c.lgbti_adoption_rights,
      lgbti_conversion_therapy_regulation: c.lgbti_conversion_therapy_regulation,
      lgbti_gender_recognition: c.lgbti_gender_recognition,
    }));

    // Cross-border warnings: flag when traveling between countries with very different scores
    const crossBorderWarnings: CrossBorderWarning[] = [];
    // Use trip order (order of country_ids as they appear in the itinerary)
    const orderedCountries = uniqueIds
      .map((id) => safetySummaries.find((c) => c.id === id))
      .filter(Boolean) as CountrySafety[];

    for (let i = 0; i < orderedCountries.length - 1; i++) {
      const from = orderedCountries[i];
      const to = orderedCountries[i + 1];
      if (from.id === to.id) continue;
      // Compared by VERDICT RANK, not by score.
      //
      // This was `equality_score ?? 50` on both sides, which invented a
      // midpoint for any country we have not measured — fabricating a 40-point
      // drop against an unscored neighbour, or hiding a real one behind it.
      // An unknown destination now produces no comparison at all, because we
      // genuinely cannot make one.
      if (from.verdict === 'unknown' || to.verdict === 'unknown') continue;
      const rankDrop = VERDICT_ORDER[from.verdict] - VERDICT_ORDER[to.verdict];
      // Two steps, e.g. protected -> hostile or partial -> criminalized. The
      // old 30-point threshold was roughly the same distance on a scale where
      // the bands are 20 points wide.
      if (rankDrop >= 2) {
        crossBorderWarnings.push({
          from: { name: from.name, score: from.equality_score },
          to: { name: to.name, score: to.equality_score },
          scoreDrop: rankDrop,
          message: `Significant change in LGBTQ+ rights when traveling from ${from.name} to ${to.name}. Review local laws before arriving.`,
        });
      }
    }

    const hasCriminalizedDestination = safetySummaries.some((c) => c.criminalized);
    const hasDeathPenaltyDestination = safetySummaries.some((c) => c.deathPenalty);
    // Was `Math.min(...map(c => c.equality_score ?? 50))`, which is the worst
    // of the four fabricated defaults: a trip made entirely of unscored
    // destinations computed 50, never cleared the `< 40` test, and so reported
    // overall risk `low`. Unmeasured read as safe.
    const hasUnknownDestination = safetySummaries.some((c) => c.verdict === 'unknown');
    const hasHostileDestination = safetySummaries.some((c) => c.verdict === 'hostile');

    // `possible` escalates to critical alongside `confirmed`. ILGA records
    // "no legal certainty" for Afghanistan, Pakistan, Qatar, Somalia and the
    // UAE while naming the death penalty in the same row's `penalty` field;
    // routing that to `high` treats the source's uncertainty as a negative
    // finding. Over-warning about a capital penalty costs a traveller caution
    // they did not need; under-warning is not recoverable.
    const hasDeathPenaltyRiskDestination = safetySummaries.some(
      (c) => c.deathPenaltyRisk !== 'none',
    );

    let overallRisk: TripSafetyReport['overallRisk'] = 'low';
    if (hasDeathPenaltyRiskDestination) overallRisk = 'critical';
    else if (hasCriminalizedDestination) overallRisk = 'high';
    else if (hasHostileDestination) overallRisk = 'moderate';
    // An unmeasured destination holds the trip off `low`. `low` is a claim —
    // "we looked and it is fine" — and we have not looked. `moderate` is the
    // most we can honestly say, and hasUnknownDestination lets the UI explain
    // why rather than implying a measurement.
    else if (hasUnknownDestination) overallRisk = 'moderate';

    return {
      countries: safetySummaries,
      crossBorderWarnings,
      status,
      overallRisk,
      hasCriminalizedDestination,
      hasDeathPenaltyDestination,
      hasDeathPenaltyRiskDestination,
      hasUnknownDestination,
    };
  }, [countries, uniqueIds, status]);
}
