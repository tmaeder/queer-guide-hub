-- Classifier v3 regen + attribute columns (companion to 20260926100000).
--
-- Regenerates subcategory_group / department against the v3 vocabulary and
-- adds the finer-categorisation surface in the SAME rewrite pass:
--   subcategory_fine        — nullable third tier (STORED, v3 fine ladder)
--   attributes jsonb        — canonical listing attributes (see COMMENT below);
--                             written only by the marketplace-variant-backfill
--                             runner (PR 3), default '{}'.
--   attributes_extracted_at — the runner's resume marker (tagged_at pattern)
--   sizes / colors text[]   — GENERATED from attributes; the filterable,
--                             GIN-indexable mirror of the two highest-traffic
--                             attribute axes (PostgREST `ov` pushdown).
--
-- content_rating is deliberately NOT touched — its function did not change in
-- v3, and re-adding it would re-litigate the v2 search delete/enqueue block.
-- Group/department value changes have no search consequence today: the
-- marketplace search facets don't yet carry them (that lands in PR 5 with an
-- explicit reindex), and index eligibility is content_rating-only.
--
-- Two ALTERs = two table rewrites (~134 MB heap each, no row triggers, no
-- search storm). Split is deliberate: the sizes/colors generation expressions
-- reference the attributes column, and referencing a column added in the same
-- ALTER is not portable — a second rewrite is cheap; a failed migration is not.
SET lock_timeout = '5s';

ALTER TABLE public.marketplace_listings
  DROP COLUMN subcategory_group,
  DROP COLUMN department,
  ADD COLUMN subcategory_group text GENERATED ALWAYS AS (public.marketplace_subcategory_group(subcategory, title)) STORED,
  ADD COLUMN department text GENERATED ALWAYS AS (public.marketplace_department(subcategory, title)) STORED,
  ADD COLUMN subcategory_fine text GENERATED ALWAYS AS (public.marketplace_subcategory_fine(subcategory, title)) STORED,
  ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN attributes_extracted_at timestamptz;

ALTER TABLE public.marketplace_listings
  ADD COLUMN sizes text[] GENERATED ALWAYS AS (public.jsonb_text_array(attributes->'size')) STORED,
  ADD COLUMN colors text[] GENERATED ALWAYS AS (public.jsonb_text_array(attributes->'color')) STORED;

COMMENT ON COLUMN public.marketplace_listings.attributes IS
  'Canonical product attributes, written ONLY by marketplace-variant-backfill. '
  'Whitelisted keys; arrays hold canonical bare slugs (no namespace prefix): '
  '{"color":["black","rainbow"],"size":["s","m","eu-38","w32"],"material":["cotton"],'
  '"genre":["memoir"],"fit":["femme-cut"],"condition":"new","gtin":"…","dimensions":"…"}. '
  'sizes/colors are GENERATED mirrors for array-overlap filtering; the tag mirror '
  '(color-*/size-*/genre-*/fit-* in unified_tags) is derived from this column too.';

-- Re-create the two indexes the DROP COLUMN took down + the new surface.
CREATE INDEX idx_marketplace_listings_subcategory_group
  ON public.marketplace_listings USING btree (subcategory_group) WHERE (status = 'active'::text);
CREATE INDEX idx_marketplace_listings_department
  ON public.marketplace_listings USING btree (department) WHERE (status = 'active'::text);
CREATE INDEX idx_marketplace_listings_subcategory_fine
  ON public.marketplace_listings USING btree (subcategory_fine) WHERE (status = 'active'::text);
CREATE INDEX idx_marketplace_listings_attributes
  ON public.marketplace_listings USING gin (attributes jsonb_path_ops);
CREATE INDEX idx_marketplace_listings_sizes
  ON public.marketplace_listings USING gin (sizes);
CREATE INDEX idx_marketplace_listings_colors
  ON public.marketplace_listings USING gin (colors);

-- ── Fine-tier counts (browse sub-tiles) — same gate/grant pattern as
--    get_marketplace_subcategory_group_counts (20260709100500) ────────────────
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
