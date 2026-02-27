-- Add columns for UN SDG (Sustainable Development Goals) data
ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS un_m49_code INTEGER,
  ADD COLUMN IF NOT EXISTS sdg_data JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sdg_last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.countries.un_m49_code IS 'UN M49 numeric country code for SDG API lookups';
COMMENT ON COLUMN public.countries.sdg_data IS 'SDG indicator data keyed by goal number (1-17)';
COMMENT ON COLUMN public.countries.sdg_last_synced_at IS 'Timestamp of last SDG data sync';
