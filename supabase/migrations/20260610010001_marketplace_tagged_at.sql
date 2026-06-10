-- Marketplace Tagging Truth Engine — dedicated resume marker.
-- classified_at is classify-relevance-backfill's resume marker (it selects
-- WHERE classified_at IS NULL); the tag engine stamping it would silently exclude
-- rows from future relevance passes. Give the tag engine its own tagged_at.
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS tagged_at timestamptz;

CREATE OR REPLACE FUNCTION public.marketplace_due_for_tagging(p_limit int DEFAULT 150)
RETURNS TABLE (
  id uuid, title text, description text, brand text, subcategory text, subcategory_slug text,
  content_rating text, community_owned_tags text[], lgbti_relevance_score numeric, has_attributes boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.title, l.description, l.brand, l.subcategory, l.subcategory_slug,
         l.content_rating, l.community_owned_tags, l.lgbti_relevance_score,
         EXISTS (SELECT 1 FROM public.unified_tag_assignments a JOIN public.unified_tags t ON t.id=a.tag_id
                 WHERE a.entity_type='marketplace_listing' AND a.entity_id=l.id AND t.category IN ('material','occasion','vibe')) AS has_attributes
  FROM public.marketplace_listings l
  WHERE l.status='active'
  ORDER BY
    (l.tagged_at IS NOT NULL),          -- never-tagged first
    EXISTS (SELECT 1 FROM public.unified_tag_assignments a JOIN public.unified_tags t ON t.id=a.tag_id
            WHERE a.entity_type='marketplace_listing' AND a.entity_id=l.id AND t.category IN ('material','occasion','vibe')),
    l.tagged_at ASC NULLS FIRST, l.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION public.marketplace_due_for_tagging(int) TO service_role, authenticated;
