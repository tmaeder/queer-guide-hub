-- Reconstructed from live supabase_migrations.schema_migrations.statements
-- (version 20260704103309, applied 2026-07-04 via MCP apply_migration without
-- a committed file — heals repo<->history drift; content is byte-faithful to
-- what already ran, CI will skip it).
ALTER TABLE public.marketplace_listings
  DROP COLUMN IF EXISTS department,
  ADD COLUMN IF NOT EXISTS department text
    GENERATED ALWAYS AS (public.marketplace_department(subcategory)) STORED,
  ADD COLUMN IF NOT EXISTS subcategory_group text
    GENERATED ALWAYS AS (public.marketplace_subcategory_group(subcategory)) STORED;
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_department
  ON public.marketplace_listings (department) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_subcategory_group
  ON public.marketplace_listings (subcategory_group) WHERE status = 'active';
