-- Fix three DB issues reported from /resources page:
-- 1. increment_personality_views: overwritten by placeholder in 20250817 migration
-- 2. tag_usage_summary: view never applied to prod + missing GRANT
-- 3. get_category_tree: called in code but never created

-- 1. Restore real increment_personality_views function
CREATE OR REPLACE FUNCTION public.increment_personality_views(personality_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  UPDATE public.personalities
  SET view_count = view_count + 1,
      updated_at = now()
  WHERE id = personality_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_personality_views(UUID) TO anon, authenticated;

-- 2. Create tag_usage_summary view (never applied to prod) + grant
CREATE OR REPLACE VIEW public.tag_usage_summary AS
SELECT
  ut.id,
  ut.name,
  ut.slug,
  ut.category,
  ut.usage_count,
  COUNT(CASE WHEN uta.entity_type = 'event' THEN 1 END) as event_count,
  COUNT(CASE WHEN uta.entity_type = 'venue' THEN 1 END) as venue_count,
  COUNT(CASE WHEN uta.entity_type = 'marketplace_listing' THEN 1 END) as marketplace_count,
  COUNT(CASE WHEN uta.entity_type = 'content' THEN 1 END) as content_count,
  COUNT(CASE WHEN uta.entity_type = 'news_article' THEN 1 END) as news_count,
  COUNT(CASE WHEN uta.entity_type = 'community_post' THEN 1 END) as post_count,
  COUNT(CASE WHEN uta.entity_type = 'community_group' THEN 1 END) as group_count
FROM public.unified_tags ut
LEFT JOIN public.unified_tag_assignments uta ON ut.id = uta.tag_id
GROUP BY ut.id, ut.name, ut.slug, ut.category, ut.usage_count
ORDER BY ut.usage_count DESC;

ALTER VIEW public.tag_usage_summary OWNER TO postgres;
GRANT SELECT ON public.tag_usage_summary TO anon, authenticated;

-- 3. Grant execute on existing get_category_tree (parameterized version already exists)
GRANT EXECUTE ON FUNCTION public.get_category_tree(uuid) TO anon, authenticated;

-- 4. Fix get_similar_personalities: vector(1536) → vector(768) dimension mismatch
CREATE OR REPLACE FUNCTION public.get_similar_personalities(
  personality_uuid uuid,
  result_limit integer DEFAULT 6,
  min_similarity double precision DEFAULT 0.3
)
RETURNS TABLE(
  id uuid, name text, profession text, nationality text, image_url text,
  is_living boolean, birth_date date, death_date date, description text, similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  source_embedding vector(768);
BEGIN
  SELECT ce.embedding INTO source_embedding
  FROM content_embeddings ce
  WHERE ce.content_id = personality_uuid
    AND ce.content_type = 'personality'
  LIMIT 1;

  IF source_embedding IS NULL THEN
    RETURN QUERY
    SELECT
      p.id, p.name, p.profession, p.nationality, p.image_url,
      p.is_living, p.birth_date, p.death_date, p.description,
      0.0::FLOAT AS similarity
    FROM personalities p
    WHERE p.id != personality_uuid
      AND p.visibility = 'public'
      AND p.profession IS NOT NULL
      AND p.profession = (SELECT p2.profession FROM personalities p2 WHERE p2.id = personality_uuid)
    ORDER BY p.view_count DESC NULLS LAST
    LIMIT result_limit;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name, p.profession, p.nationality, p.image_url,
    p.is_living, p.birth_date, p.death_date, p.description,
    (1 - (ce.embedding <=> source_embedding))::FLOAT AS similarity
  FROM content_embeddings ce
  JOIN personalities p ON p.id = ce.content_id
  WHERE ce.content_type = 'personality'
    AND ce.content_id != personality_uuid
    AND p.visibility = 'public'
    AND (1 - (ce.embedding <=> source_embedding)) > min_similarity
  ORDER BY ce.embedding <=> source_embedding
  LIMIT result_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_similar_personalities(uuid, integer, double precision) TO anon, authenticated;
