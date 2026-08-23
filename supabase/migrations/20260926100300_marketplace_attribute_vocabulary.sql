-- Marketplace attribute vocabulary: color-* / size-* / genre-* / fit-*
-- (finer-categorisation program, PR 2) — plus TWO live-bug repairs this
-- vocabulary depends on.
--
-- ── Why prefix-keyed, not category-keyed (LIVE BUG, measured 2026-08-23) ─────
-- The 20260609000000 attribute engine keyed everything on
-- unified_tags.category IN ('material','occasion','vibe'). The tag-category
-- consolidation (20260919100000) made `category` trigger-derived from
-- category_id → tag_categories — and a later sweep assigned the attribute
-- rows GLOSSARY categories ("Expression & Presentation", "Current Affairs" …).
-- Result: category IN ('material','occasion','vibe') matches ZERO rows on
-- prod, so get_marketplace_tag_facets returns nothing (the browse Attributes
-- accordion has been silently empty) and marketplace-tag-backfill loads an
-- empty vocabulary. The namespace PREFIX is the only stable key — it is what
-- the hygiene exemptions already use. This migration re-keys the facet RPC;
-- the edge-fn vocab load is re-keyed in the same PR series (PR 3).
--
-- Known prefix collision, accepted: unified_tags has 'size-queen'
-- (Slang & Terminology, status='deprecated'). It is excluded from every
-- attribute surface by status/vocabulary filters; the cost of exempting it
-- from hygiene sweeps is a missed flag on an already-deprecated row.

-- ============================================================================
-- 1. Vocabulary seeds (pattern 20260609000000). `category` text is now
--    trigger-derived and NOT the key — the prefix is. seo_indexable=false:
--    attribute tags are facets, not glossary pages.
-- ============================================================================
INSERT INTO public.unified_tags (slug, name, entity_kind, status, seo_indexable) VALUES
  -- color (color-) — ~20 canonical; alias folding (burgundy→red, charcoal→grey,
  -- bunt/regenbogen→multicolor/rainbow) happens in _shared/marketplace-attributes.ts.
  ('color-black','Black','concept','active',false),
  ('color-white','White','concept','active',false),
  ('color-grey','Grey','concept','active',false),
  ('color-red','Red','concept','active',false),
  ('color-orange','Orange','concept','active',false),
  ('color-yellow','Yellow','concept','active',false),
  ('color-green','Green','concept','active',false),
  ('color-blue','Blue','concept','active',false),
  ('color-navy','Navy','concept','active',false),
  ('color-purple','Purple','concept','active',false),
  ('color-pink','Pink','concept','active',false),
  ('color-brown','Brown','concept','active',false),
  ('color-beige','Beige','concept','active',false),
  ('color-cream','Cream','concept','active',false),
  ('color-gold','Gold','concept','active',false),
  ('color-silver','Silver','concept','active',false),
  ('color-rose-gold','Rose Gold','concept','active',false),
  ('color-clear','Clear','concept','active',false),
  ('color-multicolor','Multicolor','concept','active',false),
  ('color-rainbow','Rainbow','concept','active',false),
  -- size (size-) — the ALPHA LADDER ONLY, by design: numeric sizes (eu-38,
  -- w32, shoe sizes) live verbatim-canonicalized in
  -- marketplace_listings.attributes->'size' / the sizes[] array and reach
  -- facets from there; tags stay a small curated browse vocabulary.
  ('size-xxs','XXS','concept','active',false),
  ('size-xs','XS','concept','active',false),
  ('size-s','S','concept','active',false),
  ('size-m','M','concept','active',false),
  ('size-l','L','concept','active',false),
  ('size-xl','XL','concept','active',false),
  ('size-2xl','2XL','concept','active',false),
  ('size-3xl','3XL','concept','active',false),
  ('size-4xl','4XL','concept','active',false),
  ('size-5xl','5XL','concept','active',false),
  ('size-one-size','One size','concept','active',false),
  -- genre (genre-) — books/film/music departments only (context-gated in the UI).
  ('genre-fiction','Fiction','concept','active',false),
  ('genre-memoir','Memoir','concept','active',false),
  ('genre-biography','Biography','concept','active',false),
  ('genre-poetry','Poetry','concept','active',false),
  ('genre-romance','Romance','concept','active',false),
  ('genre-scifi-fantasy','Sci-fi & Fantasy','concept','active',false),
  ('genre-horror','Horror','concept','active',false),
  ('genre-mystery-thriller','Mystery & Thriller','concept','active',false),
  ('genre-comics','Comics & Graphic Novels','concept','active',false),
  ('genre-ya','Young Adult','concept','active',false),
  ('genre-kids','Kids','concept','active',false),
  ('genre-history','History','concept','active',false),
  ('genre-essays','Essays','concept','active',false),
  ('genre-queer-theory','Queer Theory','concept','active',false),
  ('genre-art-photography','Art & Photography','concept','active',false),
  ('genre-erotica','Erotica','concept','active',false),
  -- fit (fit-) — GARMENT CUT ONLY, never identity. Guardrail (binding on every
  -- writer): derive only from explicit merchant garment labels ("men's fit",
  -- "Damenschnitt", "unisex", "compression") — never from imagery, model
  -- presentation, or identity vocabulary.
  ('fit-masc-cut','Masc cut','concept','active',false),
  ('fit-femme-cut','Femme cut','concept','active',false),
  ('fit-unisex','Unisex','concept','active',false),
  ('fit-compression','Compression','concept','active',false),
  ('fit-adaptive','Adaptive','concept','active',false),
  ('fit-petite','Petite','concept','active',false),
  ('fit-tall','Tall','concept','active',false)
ON CONFLICT (slug) DO UPDATE SET status = 'active', updated_at = now();

-- ============================================================================
-- 2. Hygiene-exemption extension. The facet-namespace regex lives in LIVE
--    functions (tags_without_category, tag_hygiene_stats on prod today);
--    without the new prefixes a zero-usage size-5xl would be flagged/auto-
--    deprecated by the sweeps. Catalog-driven in-place replace instead of
--    restating bodies: robust to drift and to carriers this migration cannot
--    know about. Idempotent — an already-extended body no longer matches.
-- ============================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc LIKE '%(mat|vibe|occ|dept|attr|own|rating)-%'
  LOOP
    EXECUTE replace(
      pg_get_functiondef(r.oid),
      '(mat|vibe|occ|dept|attr|own|rating)-',
      '(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-');
  END LOOP;
END $$;

-- ============================================================================
-- 3. Re-key get_marketplace_tag_facets on the slug prefix (the live-bug fix).
--    Same signature, gate and grants as 20260709100500; kind is now derived
--    from the namespace instead of the destroyed category text.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_marketplace_tag_facets(
  p_department text DEFAULT NULL,
  p_subcategory_group text DEFAULT NULL,
  p_include_adult boolean DEFAULT false)
RETURNS TABLE(slug text, name text, kind text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ut.slug, ut.name,
         CASE split_part(ut.slug, '-', 1)
           WHEN 'mat'   THEN 'material'
           WHEN 'occ'   THEN 'occasion'
           WHEN 'vibe'  THEN 'vibe'
           WHEN 'color' THEN 'color'
           WHEN 'size'  THEN 'size'
           WHEN 'genre' THEN 'genre'
           WHEN 'fit'   THEN 'fit'
         END AS kind,
         count(*)::bigint AS count
  FROM public.unified_tag_assignments uta
  JOIN public.unified_tags ut ON ut.id = uta.tag_id
  JOIN public.marketplace_listings ml ON ml.id = uta.entity_id
  WHERE uta.entity_type = 'marketplace_listing'
    AND ut.slug ~ '^(mat|occ|vibe|color|size|genre|fit)-'
    AND ut.status = 'active'
    AND ml.status = 'active'
    AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
    AND (p_department IS NULL OR ml.department = p_department)
    AND (p_subcategory_group IS NULL OR ml.subcategory_group = p_subcategory_group)
  GROUP BY ut.slug, ut.name
  ORDER BY count(*) DESC
  LIMIT 80;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_tag_facets(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_tag_facets(text, text, boolean) TO anon, authenticated;

-- ============================================================================
-- 4. Attributes column contract + frozen legacy tree.
-- ============================================================================
COMMENT ON TABLE public.marketplace_categories IS
  'FROZEN 2026-08-23 (finer-categorisation program): superseded by the generated '
  'department / subcategory_group / subcategory_fine columns on marketplace_listings '
  '(category_id was populated on 11 of 69,738 rows — the resolver never matched). '
  'Still referenced by commit_marketplace_staging_batch, get_marketplace_facets '
  'p_category_id and client hooks; dropping it is a separate coordinated PR '
  '(precedent 20260915120100: preserve contents in the migration header).';
