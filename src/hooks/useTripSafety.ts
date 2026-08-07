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
  lgbti_criminalization: unknown;
  lgbti_employment_protection: unknown;
  lgbti_same_sex_unions: unknown;
  lgbti_adoption_rights: unknown;
  lgbti_conversion_therapy_regulation: unknown;
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
        .select(
          'id, name, code, equality_score, lgbti_criminalization, lgbti_employment_protection, lgbti_same_sex_unions, lgbti_adoption_rights, lgbti_conversion_therapy_regulation',
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
      deathPenaltyRisk: deathPenaltyRisk(
        c.lgbti_criminalization as Record<string, unknown> | null,
      ),
      lgbti_criminalization: c.lgbti_criminalization,
      lgbti_employment_protection: c.lgbti_employment_protection,
      lgbti_same_sex_unions: c.lgbti_same_sex_unions,
      lgbti_adoption_rights: c.lgbti_adoption_rights,
      lgbti_conversion_therapy_regulation: c.lgbti_conversion_therapy_regulation,
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
      const fromScore = from.equality_score ?? 50;
      const toScore = to.equality_score ?? 50;
      const drop = fromScore - toScore;
      if (drop >= 30) {
        crossBorderWarnings.push({
          from: { name: from.name, score: from.equality_score },
          to: { name: to.name, score: to.equality_score },
          scoreDrop: drop,
          message: `Significant change in LGBTQ+ rights when traveling from ${from.name} to ${to.name}. Review local laws before arriving.`,
        });
      }
    }

    const hasCriminalizedDestination = safetySummaries.some((c) => c.criminalized);
    const hasDeathPenaltyDestination = safetySummaries.some((c) => c.deathPenalty);
    const minScore = Math.min(...safetySummaries.map((c) => c.equality_score ?? 50));

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
    else if (minScore < 40) overallRisk = 'moderate';

    return {
      countries: safetySummaries,
      crossBorderWarnings,
      status,
      overallRisk,
      hasCriminalizedDestination,
      hasDeathPenaltyDestination,
      hasDeathPenaltyRiskDestination,
    };
  }, [countries, uniqueIds, status]);
}
