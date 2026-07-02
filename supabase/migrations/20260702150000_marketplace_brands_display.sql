-- ============================================================
-- Brands as first-class display objects (extends marketplace_brands)
--
-- The 20260608 registry is an ownership review queue; this adds the public
-- display layer: slug (routing), story/logo/website (brand page content),
-- is_spotlight (editorial pin for the landing brand rail). No new table,
-- no brand_id FK on listings — the brand_key generated column (20260702130000)
-- + the registry's brand_key UNIQUE make the join cheap.
-- ============================================================

ALTER TABLE public.marketplace_brands
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS story text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS is_spotlight boolean NOT NULL DEFAULT false;

-- Slug rule (keep in sync with brandSlug() in src/lib/marketplaceTaxonomy.ts):
-- brand_key is already lower+space-collapsed; replace non-alnum runs with '-'.
CREATE OR REPLACE FUNCTION public.marketplace_brand_slug(p_key text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT nullif(btrim(regexp_replace(p_key, '[^a-z0-9]+', '-', 'g'), '-'), '');
$$;

-- Backfill with collision uniquifier (-2, -3, …).
WITH ranked AS (
  SELECT id,
         public.marketplace_brand_slug(brand_key) AS base,
         row_number() OVER (PARTITION BY public.marketplace_brand_slug(brand_key) ORDER BY created_at, id) AS rn
  FROM public.marketplace_brands
  WHERE slug IS NULL
)
UPDATE public.marketplace_brands b
SET slug = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || r.rn END
FROM ranked r WHERE b.id = r.id AND r.base IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_brands_slug
  ON public.marketplace_brands (slug) WHERE slug IS NOT NULL;

-- Keep new registry rows sluggged: extend the refresher to stamp slug on insert.
-- (marketplace_register_brands upserts by brand_key; a BEFORE trigger is the
-- least invasive way to guarantee slug without rewriting that function.)
CREATE OR REPLACE FUNCTION public.marketplace_brands_set_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.marketplace_brand_slug(NEW.brand_key);
    -- uniquify on collision
    IF EXISTS (SELECT 1 FROM public.marketplace_brands WHERE slug = NEW.slug AND id <> NEW.id) THEN
      NEW.slug := NEW.slug || '-' || substr(md5(NEW.brand_key), 1, 4);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_marketplace_brands_slug ON public.marketplace_brands;
CREATE TRIGGER trg_marketplace_brands_slug
  BEFORE INSERT OR UPDATE OF brand_key ON public.marketplace_brands
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_brands_set_slug();

-- ── public brand fetch (any status; trust-gated fields approved-only) ──
-- RLS public-read covers approved rows only; un-reviewed brands still get a
-- page (plain product grouping) but ownership_tags/story stay hidden and
-- suggested_tags NEVER leave the database.
CREATE OR REPLACE FUNCTION public.get_marketplace_brand(p_slug text)
RETURNS TABLE (
  slug text,
  display_name text,
  brand_key text,
  product_count integer,
  website text,
  logo_url text,
  story text,
  ownership_tags text[],
  is_approved boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.slug,
    b.display_name,
    b.brand_key,
    b.product_count,
    b.website,
    b.logo_url,
    CASE WHEN b.status = 'approved' THEN b.story END,
    CASE WHEN b.status = 'approved' THEN b.ownership_tags ELSE '{}'::text[] END,
    b.status = 'approved'
  FROM public.marketplace_brands b
  WHERE b.slug = p_slug
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_brand(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_brand(text) TO anon, authenticated;

-- ── spotlight brands for the landing rail ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_marketplace_spotlight_brands(p_limit int DEFAULT 8)
RETURNS TABLE (
  slug text,
  display_name text,
  product_count integer,
  logo_url text,
  ownership_tags text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.slug, b.display_name, b.product_count, b.logo_url, b.ownership_tags
  FROM public.marketplace_brands b
  WHERE b.status = 'approved'
    AND b.ownership_tags && ARRAY['queer_owned','trans_owned']
    AND b.slug IS NOT NULL
    AND b.product_count > 0
  ORDER BY b.is_spotlight DESC, b.product_count DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 8), 24));
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_spotlight_brands(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_spotlight_brands(int) TO anon, authenticated;

-- ── keep the registry fresh weekly (product_count drifts with ingest) ──
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('marketplace_register_brands','Marketplace brand registry refresh',
   'Weekly re-scan of marketplace_listings brands into marketplace_brands (new brands as pending, product_count/top_source refresh).',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"marketplace_register_brands"}'::jsonb, '40 4 * * 0')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='marketplace_register_brands') THEN
    PERFORM cron.unschedule('marketplace_register_brands');
  END IF;
  PERFORM cron.schedule('marketplace_register_brands', '40 4 * * 0',
    'SELECT public.marketplace_register_brands();');
END $$;

DO $$ BEGIN
  RAISE NOTICE 'marketplace_brands display layer ready (slug/story/logo/spotlight + RPCs)';
END $$;
