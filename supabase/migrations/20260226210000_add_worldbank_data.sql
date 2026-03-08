-- Add World Bank data columns to countries table
ALTER TABLE public.countries
ADD COLUMN IF NOT EXISTS wb_income_level TEXT,
ADD COLUMN IF NOT EXISTS wb_lending_type TEXT,
ADD COLUMN IF NOT EXISTS wb_region TEXT,
ADD COLUMN IF NOT EXISTS wb_indicators JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS wb_last_synced_at TIMESTAMPTZ;

-- Index for income level filtering
CREATE INDEX IF NOT EXISTS idx_countries_wb_income_level ON public.countries(wb_income_level);

COMMENT ON COLUMN public.countries.wb_income_level IS 'World Bank income classification (Low income, Lower middle income, Upper middle income, High income)';
COMMENT ON COLUMN public.countries.wb_indicators IS 'JSONB with World Bank indicator values: population_growth, unemployment_rate, inflation_rate, internet_users_pct, electricity_access_pct, urban_population_pct, health_expenditure_pc, education_expenditure_pct, co2_emissions_pc, trade_pct_gdp, gini_index, gni_per_capita, child_mortality_rate';
COMMENT ON COLUMN public.countries.wb_last_synced_at IS 'Timestamp of last World Bank data sync';
