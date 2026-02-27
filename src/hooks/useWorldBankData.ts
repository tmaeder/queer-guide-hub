import { useMemo } from 'react';

export interface WorldBankIndicators {
  population_growth?: number;
  unemployment_rate?: number;
  inflation_rate?: number;
  internet_users_pct?: number;
  electricity_access_pct?: number;
  urban_population_pct?: number;
  health_expenditure_pc?: number;
  education_expenditure_pct?: number;
  co2_emissions_pc?: number;
  trade_pct_gdp?: number;
  gini_index?: number;
  gni_per_capita?: number;
  child_mortality_rate?: number;
}

export interface WorldBankData {
  // From direct DB columns
  gdp_usd?: number | null;
  gdp_per_capita_usd?: number | null;
  population?: number | null;
  life_expectancy?: number | null;
  literacy_rate?: number | null;
  human_development_index?: number | null;
  // World Bank specific columns
  wb_income_level?: string | null;
  wb_lending_type?: string | null;
  wb_region?: string | null;
  wb_last_synced_at?: string | null;
  // JSONB indicators
  indicators: WorldBankIndicators;
  // Whether any WB data exists
  hasData: boolean;
}

/**
 * Extracts World Bank data from a country object (already loaded by useOptimizedCountry).
 * No extra API call needed — this just parses the existing data.
 */
export function useWorldBankData(country: any | null): WorldBankData {
  return useMemo(() => {
    if (!country) {
      return { indicators: {}, hasData: false };
    }

    const indicators: WorldBankIndicators = country.wb_indicators || {};

    const hasData = !!(
      country.wb_last_synced_at ||
      country.gdp_usd ||
      country.gdp_per_capita_usd ||
      country.wb_income_level ||
      Object.keys(indicators).length > 0
    );

    return {
      gdp_usd: country.gdp_usd,
      gdp_per_capita_usd: country.gdp_per_capita_usd,
      population: country.population,
      life_expectancy: country.life_expectancy,
      literacy_rate: country.literacy_rate,
      human_development_index: country.human_development_index,
      wb_income_level: country.wb_income_level,
      wb_lending_type: country.wb_lending_type,
      wb_region: country.wb_region,
      wb_last_synced_at: country.wb_last_synced_at,
      indicators,
      hasData,
    };
  }, [country]);
}
