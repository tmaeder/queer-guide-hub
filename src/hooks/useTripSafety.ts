import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getScoreLabel, isCriminalized, hasDeathPenalty, type EqualityScoreBreakdown } from '@/utils/equalityScore';

export interface CountrySafety {
  id: string;
  name: string;
  code: string | null;
  equality_score: number | null;
  scoreBreakdown: EqualityScoreBreakdown;
  criminalized: boolean;
  deathPenalty: boolean;
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

export interface TripSafetyReport {
  countries: CountrySafety[];
  crossBorderWarnings: CrossBorderWarning[];
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';
  hasCriminalizedDestination: boolean;
  hasDeathPenaltyDestination: boolean;
}

export function useTripSafety(countryIds: string[]) {
  const uniqueIds = useMemo(() => [...new Set(countryIds.filter(Boolean))], [countryIds]);

  const { data: countries } = useQuery({
    queryKey: ['trip-safety', uniqueIds],
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

  return useMemo((): TripSafetyReport => {
    if (!countries || countries.length === 0) {
      return {
        countries: [],
        crossBorderWarnings: [],
        overallRisk: 'low',
        hasCriminalizedDestination: false,
        hasDeathPenaltyDestination: false,
      };
    }

    const safetySummaries: CountrySafety[] = countries.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      equality_score: c.equality_score,
      scoreBreakdown: getScoreLabel(c.equality_score),
      criminalized: isCriminalized(c.lgbti_criminalization as string | null),
      deathPenalty: hasDeathPenalty(c.lgbti_criminalization as string | null),
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

    let overallRisk: TripSafetyReport['overallRisk'] = 'low';
    if (hasDeathPenaltyDestination) overallRisk = 'critical';
    else if (hasCriminalizedDestination) overallRisk = 'high';
    else if (minScore < 40) overallRisk = 'moderate';

    return {
      countries: safetySummaries,
      crossBorderWarnings,
      overallRisk,
      hasCriminalizedDestination,
      hasDeathPenaltyDestination,
    };
  }, [countries, uniqueIds]);
}
