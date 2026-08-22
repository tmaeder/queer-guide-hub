-- Regenerate the three classifier-derived STORED columns on marketplace_listings
-- against the v2 functions (20260916120000):
--   subcategory_group / department -> now (subcategory, title) with title fallback
--   content_rating                 -> recompute under the extended Safe Mode vocab
--     (a CREATE OR REPLACE of the function does NOT recompute existing STORED
--      values — only a column regen does, so the 188+ known sfw-rated toys keep
--      their wrong rating until this rewrite runs).
--
-- One ALTER = one table rewrite (~134 MB heap). lock_timeout keeps the
-- AccessExclusive acquisition from queueing behind live marketplace traffic
-- (fail fast + retry beats a lock queue pile-up — precedent 20260704120000).
-- A table rewrite fires no row triggers, so there is NO search_documents storm;
-- the search consequences are handled explicitly below.
SET lock_timeout = '5s';

ALTER TABLE public.marketplace_listings
  DROP COLUMN subcategory_group,
  DROP COLUMN department,
  DROP COLUMN content_rating,
  ADD COLUMN content_rating text GENERATED ALWAYS AS (public.marketplace_content_rating(subcategory, title, description)) STORED,
  ADD COLUMN subcategory_group text GENERATED ALWAYS AS (public.marketplace_subcategory_group(subcategory, title)) STORED,
  ADD COLUMN department text GENERATED ALWAYS AS (public.marketplace_department(subcategory, title)) STORED;

CREATE INDEX idx_marketplace_listings_subcategory_group
  ON public.marketplace_listings USING btree (subcategory_group) WHERE (status = 'active'::text);
CREATE INDEX idx_marketplace_listings_department
  ON public.marketplace_listings USING btree (department) WHERE (status = 'active'::text);
CREATE INDEX idx_marketplace_listings_content_rating
  ON public.marketplace_listings USING btree (content_rating) WHERE (status = 'active'::text);

-- ── Search consequences ──────────────────────────────────────────────────────
-- search_documents_index_marketplace() only admits sfw/suggestive rows and
-- never DELETEs a row that has become ineligible. Listings whose rating just
-- flipped sfw→explicit under the new vocab are exactly the Safe Mode hole this
-- fixes — remove them from the index NOW, not at the next incidental UPDATE.
DELETE FROM public.search_documents sd
USING public.marketplace_listings m
WHERE sd.entity_type = 'marketplace' AND sd.entity_id = m.id
  AND coalesce(m.content_rating, 'sfw') NOT IN ('sfw', 'suggestive');

-- And enqueue any row that is newly ELIGIBLE (rating relaxed) but absent —
-- the drain (search_reindex_drain, every minute) indexes them.
INSERT INTO public.search_reindex_queue (entity_type, entity_id)
SELECT 'marketplace', m.id
FROM public.marketplace_listings m
WHERE m.status = 'active'
  AND coalesce(m.content_rating, 'sfw') IN ('sfw', 'suggestive')
  AND NOT EXISTS (
    SELECT 1 FROM public.search_documents sd
    WHERE sd.entity_type = 'marketplace' AND sd.entity_id = m.id
  );
