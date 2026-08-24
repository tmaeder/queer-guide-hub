-- Classifier v3 surface + attribute columns (companion to 20260926100000).
--
-- ── WHY THIS IS NOT A TABLE REWRITE (it was, twice, and failed both times) ──
-- The first shape of this migration dropped and re-added
-- subcategory_group/department as STORED GENERATED columns and added
-- subcategory_fine/sizes/colors the same way. That forces a full rewrite of
-- marketplace_listings, and on prod it failed THREE times:
--   1. 12:49 UTC — SQLSTATE 55P03: a single 5s shot at ACCESS EXCLUSIVE never
--      lands on a table browse reads continuously.
--   2. with a lock-retry loop added — cancelled at exactly 2min by the cluster
--      default statement_timeout, mid-rewrite.
--   3. with statement_timeout raised to 15min — the rewrite was still running
--      at 13:15 when CI gave up, holding the exclusive lock the whole time.
-- Each failure left the six migrations behind this one unapplied while the
-- edge functions deployed anyway (new code, old schema).
--
-- The cost is structural, not incidental: three generated columns each
-- independently re-invoke the group ladder — marketplace_department() calls
-- marketplace_subcategory_group() again, and marketplace_subcategory_fine()
-- calls it a third time before its own ~90-pattern ladder — so a rewrite is
-- roughly 390 regex evaluations x 62k rows. A rewrite is the wrong tool at
-- this cost, at ANY timeout: it holds AccessExclusive for its whole duration,
-- which means /marketplace is down for as long as it runs.
--
-- MEASURED ALTERNATIVE (prod, rolled back): adding the five columns as plain
-- columns with constant defaults = 11.7ms, and turning the two existing
-- generated columns into plain ones with ALTER COLUMN ... DROP EXPRESSION
-- (which RETAINS their stored values) = 3.5ms. 15ms total against 14+ minutes,
-- because none of it touches a heap page.
--
-- Derivation moves from generated columns to ONE BEFORE trigger that fires
-- only when its inputs actually changed, and the existing 62k rows are
-- recomputed by a batched runner (20260926100800) instead of in one lock.
-- Trade-off, stated plainly: for the minutes between this migration and the
-- backfill draining, subcategory_group/department still hold their v2 values
-- on old rows while new writes are v3. That is a converging inconsistency
-- measured at ~0.5% of rows (19 per 4,000 sampled, almost all recoveries out
-- of 'other'), and it is strictly better than the alternative of taking the
-- marketplace offline to avoid it.

-- ── 1. New columns. Constant defaults only — no heap touched. ────────────────
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attributes_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS subcategory_fine text,
  ADD COLUMN IF NOT EXISTS sizes text[],
  ADD COLUMN IF NOT EXISTS colors text[],
  ADD COLUMN IF NOT EXISTS taxonomy_v3_at timestamptz;

COMMENT ON COLUMN public.marketplace_listings.attributes IS
  'Canonical product attributes, written ONLY by marketplace-variant-backfill. '
  'Whitelisted keys; arrays hold canonical bare slugs (no namespace prefix): '
  '{"color":["black","rainbow"],"size":["s","m","eu-38","w32"],"material":["cotton"],'
  '"genre":["memoir"],"fit":["femme-cut"],"condition":"new","gtin":"…","dimensions":"…"}. '
  'sizes/colors are trigger-maintained mirrors for array-overlap filtering; the tag '
  'mirror (color-*/size-*/genre-*/fit-* in unified_tags) is derived from this column too.';

COMMENT ON COLUMN public.marketplace_listings.subcategory_fine IS
  'Nullable third taxonomy tier under subcategory_group. NULL means "no finer '
  'evidence", never ''other'' — the UI falls back to the group tile. Maintained by '
  'trg_marketplace_listings_aa_derive; backfilled in batches by run_marketplace_taxonomy_backfill().';

COMMENT ON COLUMN public.marketplace_listings.taxonomy_v3_at IS
  'Stamped by trg_marketplace_listings_aa_derive whenever the taxonomy columns are '
  'recomputed. Exists so the backfill can FIND its work cheaply: NULL = never derived '
  'under v3. Selecting stale rows by comparing stored-vs-computed instead would '
  're-run the ~390-regex ladder over all 62k rows on every batch (measured: statement '
  'timeout), which is the very cost this design exists to avoid.';

-- ── 2. Generated -> plain, preserving stored values (catalog-only). ──────────
-- After this, department/subcategory_group are maintained by the trigger below
-- exactly as they were by their generation expressions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid = 'public.marketplace_listings'::regclass
               AND attname = 'subcategory_group' AND attgenerated = 's') THEN
    ALTER TABLE public.marketplace_listings ALTER COLUMN subcategory_group DROP EXPRESSION;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid = 'public.marketplace_listings'::regclass
               AND attname = 'department' AND attgenerated = 's') THEN
    ALTER TABLE public.marketplace_listings ALTER COLUMN department DROP EXPRESSION;
  END IF;
END $$;

-- ── 3. One BEFORE trigger owns all five derived columns. ────────────────────
-- Gated on the inputs so an ordinary listing UPDATE (price, stock, images)
-- pays nothing: the regex ladders only run when subcategory/title changed.
-- Name is `aa_` so it sorts before the other BEFORE triggers on this table
-- (BEFORE triggers fire in NAME order, and slug/price/website triggers must
-- not observe a half-derived row).
CREATE OR REPLACE FUNCTION public.marketplace_listings_derive_taxonomy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.subcategory IS DISTINCT FROM OLD.subcategory
     OR NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.subcategory_group := public.marketplace_subcategory_group(NEW.subcategory, NEW.title);
    NEW.department        := public.marketplace_department(NEW.subcategory, NEW.title);
    NEW.subcategory_fine  := public.marketplace_subcategory_fine(NEW.subcategory, NEW.title);
    NEW.taxonomy_v3_at    := now();
  END IF;

  IF TG_OP = 'INSERT' OR NEW.attributes IS DISTINCT FROM OLD.attributes THEN
    NEW.sizes  := public.jsonb_text_array(NEW.attributes -> 'size');
    NEW.colors := public.jsonb_text_array(NEW.attributes -> 'color');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_marketplace_listings_aa_derive ON public.marketplace_listings;
CREATE TRIGGER trg_marketplace_listings_aa_derive
  BEFORE INSERT OR UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_listings_derive_taxonomy();

-- ── 4. Indexes. The two department/group indexes already exist and survive
--       DROP EXPRESSION untouched, so only the new surface is created here. ──
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_subcategory_fine
  ON public.marketplace_listings USING btree (subcategory_fine) WHERE (status = 'active'::text);
-- Work-list index for the backfill. Shrinks to empty as the corpus converges,
-- so the recurring job's SELECT stays instant forever after.
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_taxonomy_pending
  ON public.marketplace_listings USING btree (id) WHERE (taxonomy_v3_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_attributes
  ON public.marketplace_listings USING gin (attributes jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_sizes
  ON public.marketplace_listings USING gin (sizes);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_colors
  ON public.marketplace_listings USING gin (colors);

-- ── 5. Fine-tier counts (browse sub-tiles) — same gate/grant pattern as
--       get_marketplace_subcategory_group_counts (20260709100500). ───────────
CREATE OR REPLACE FUNCTION public.get_marketplace_subcategory_fine_counts(
  p_department text DEFAULT NULL,
  p_subcategory_group text DEFAULT NULL,
  p_include_adult boolean DEFAULT false)
RETURNS TABLE(fine text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT subcategory_fine AS fine, count(*)::bigint AS count
  FROM public.marketplace_listings
  WHERE status = 'active'
    AND subcategory_fine IS NOT NULL
    AND (p_department IS NULL OR department = p_department)
    AND (p_subcategory_group IS NULL OR subcategory_group = p_subcategory_group)
    AND (p_include_adult OR content_rating IN ('sfw','suggestive'))
  GROUP BY subcategory_fine
  ORDER BY count(*) DESC;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_subcategory_fine_counts(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_subcategory_fine_counts(text, text, boolean) TO anon, authenticated;
