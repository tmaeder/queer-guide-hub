SET statement_timeout = '900s';
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

DELETE FROM public.search_documents sd
USING public.marketplace_listings m
WHERE sd.entity_type = 'marketplace' AND sd.entity_id = m.id
  AND coalesce(m.content_rating, 'sfw') NOT IN ('sfw', 'suggestive');

INSERT INTO public.search_reindex_queue (entity_type, entity_id)
SELECT 'marketplace', m.id
FROM public.marketplace_listings m
WHERE m.status = 'active'
  AND coalesce(m.content_rating, 'sfw') IN ('sfw', 'suggestive')
  AND NOT EXISTS (
    SELECT 1 FROM public.search_documents sd
    WHERE sd.entity_type = 'marketplace' AND sd.entity_id = m.id
  );
