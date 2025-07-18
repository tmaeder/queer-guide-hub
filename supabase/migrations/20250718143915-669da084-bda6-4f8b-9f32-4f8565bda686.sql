-- Phase 2: Clean up old tag assignment tables and update existing functions
-- After data migration is complete, we can clean up the old structures

-- 1. Drop old tag assignment tables (data already migrated to unified_tag_assignments)
DROP TABLE IF EXISTS public.event_tag_assignments CASCADE;
DROP TABLE IF EXISTS public.marketplace_tag_assignments CASCADE;
DROP TABLE IF EXISTS public.group_tag_assignments CASCADE;
DROP TABLE IF EXISTS public.news_tag_assignments CASCADE;
DROP TABLE IF EXISTS public.post_tag_assignments CASCADE;
DROP TABLE IF EXISTS public.content_tag_assignments CASCADE;

-- 2. Drop old tag tables (data migrated to unified_tags)
DROP TABLE IF EXISTS public.tags CASCADE;
DROP TABLE IF EXISTS public.content_tags CASCADE;

-- 3. Drop the old tag update function since we have a new one
DROP FUNCTION IF EXISTS public.update_tag_usage_count() CASCADE;

-- 4. Add indexes for better performance on unified system
CREATE INDEX IF NOT EXISTS idx_unified_tag_assignments_entity 
ON public.unified_tag_assignments(entity_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_unified_tag_assignments_tag 
ON public.unified_tag_assignments(tag_id);

CREATE INDEX IF NOT EXISTS idx_unified_tags_slug 
ON public.unified_tags(slug);

CREATE INDEX IF NOT EXISTS idx_unified_tags_category 
ON public.unified_tags(category);

CREATE INDEX IF NOT EXISTS idx_unified_tags_usage_count 
ON public.unified_tags(usage_count DESC);

-- 5. Update the usage count for all tags
UPDATE public.unified_tags 
SET usage_count = (
  SELECT COUNT(*)
  FROM public.unified_tag_assignments 
  WHERE tag_id = unified_tags.id
);

-- 6. Add some useful views for common queries
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