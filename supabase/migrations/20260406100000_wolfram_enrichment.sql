-- Wolfram Alpha enrichment tracking columns and scientific data

-- Countries: track when last enriched by Wolfram
ALTER TABLE countries ADD COLUMN IF NOT EXISTS wolfram_enriched_at TIMESTAMPTZ;

-- Cities: track when last enriched by Wolfram
ALTER TABLE cities ADD COLUMN IF NOT EXISTS wolfram_enriched_at TIMESTAMPTZ;

-- Tags: structured scientific data from Wolfram + enrichment timestamp
ALTER TABLE unified_tags ADD COLUMN IF NOT EXISTS scientific_data JSONB;
ALTER TABLE unified_tags ADD COLUMN IF NOT EXISTS wolfram_enriched_at TIMESTAMPTZ;

-- Partial indexes for finding un-enriched items efficiently
CREATE INDEX IF NOT EXISTS idx_countries_wolfram_null
  ON countries (population DESC NULLS LAST)
  WHERE wolfram_enriched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cities_wolfram_null
  ON cities (population DESC NULLS LAST)
  WHERE wolfram_enriched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tags_wolfram_null
  ON unified_tags (id)
  WHERE wolfram_enriched_at IS NULL;
