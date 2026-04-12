import { useMemo } from 'react';

export interface SDGGoalData {
  series: string;
  value: number | null;
  year: number | null;
  unit: string;
  description: string;
}

export interface SDGData {
  goals: Record<string, SDGGoalData>;
  hasData: boolean;
  lastSyncedAt: string | null;
}

/**
 * Extracts UN SDG data from a country object (already loaded by useOptimizedCountry).
 * No extra API call needed — this just parses the existing sdg_data JSONB field.
 */
export function useSDGData(country: Record<string, unknown> | null): SDGData {
  return useMemo(() => {
    if (!country) {
      return { goals: {}, hasData: false, lastSyncedAt: null };
    }

    const goals: Record<string, SDGGoalData> = country.sdg_data || {};

    const hasData = !!(
      country.sdg_last_synced_at && Object.values(goals).some((g: SDGGoalData) => g?.value != null)
    );

    return {
      goals,
      hasData,
      lastSyncedAt: country.sdg_last_synced_at || null,
    };
  }, [country]);
}
