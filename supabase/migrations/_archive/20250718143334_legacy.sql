-- Clean up tag system redundancies (corrected version)
-- Many tables have both 'tags' array fields AND separate tag assignment tables
-- This creates data inconsistency and redundancy

-- 1. Remove redundant 'tags' array columns from tables that have proper tag assignment tables
ALTER TABLE public.events DROP COLUMN IF EXISTS tags;
ALTER TABLE public.marketplace_listings DROP COLUMN IF EXISTS tags;
ALTER TABLE public.community_posts DROP COLUMN IF EXISTS tags;
ALTER TABLE public.community_groups DROP COLUMN IF EXISTS tags;
ALTER TABLE public.news_articles DROP COLUMN IF EXISTS tags;

-- 2. Create a unified tags table to replace multiple tag systems
-- First, let's create a unified tags table that can serve all content types
CREATE TABLE IF NOT EXISTS public.unified_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  color text DEFAULT '#6366f1',
  image_url text,
  usage_count integer DEFAULT 0,
  category text, -- For grouping tags by type if needed
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on unified tags
ALTER TABLE public.unified_tags ENABLE ROW LEVEL SECURITY;

-- Create policies for unified tags
CREATE POLICY "Tags are viewable by everyone" 
ON public.unified_tags 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage unified tags" 
ON public.unified_tags 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Migrate existing tags data to unified system
-- Insert unique tags from content_tags (has slug)
INSERT INTO public.unified_tags (name, slug, category)
SELECT DISTINCT name, slug, 'content' as category
FROM public.content_tags
ON CONFLICT (slug) DO NOTHING;

-- Insert unique tags from existing tags table (create slug from name)
INSERT INTO public.unified_tags (name, slug, description, color, image_url, usage_count, category)
SELECT DISTINCT 
  name, 
  lower(replace(replace(replace(name, ' ', '-'), '&', 'and'), '''', '')) as slug,
  description, 
  color, 
  image_url, 
  usage_count, 
  'general' as category
FROM public.tags
ON CONFLICT (slug) DO NOTHING;

-- 4. Create a unified tag assignments table
CREATE TABLE IF NOT EXISTS public.unified_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES public.unified_tags(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL, -- The ID of the tagged entity (event, venue, etc.)
  entity_type text NOT NULL, -- 'event', 'venue', 'marketplace_listing', 'content', etc.
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tag_id, entity_id, entity_type)
);

-- Enable RLS on unified tag assignments
ALTER TABLE public.unified_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tag assignments are viewable by everyone" 
ON public.unified_tag_assignments 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage tag assignments" 
ON public.unified_tag_assignments 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Migrate existing tag assignments
-- From content tag assignments
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT 
  ut.id as tag_id,
  cta.content_id as entity_id,
  'content' as entity_type
FROM public.content_tag_assignments cta
JOIN public.content_tags ct ON ct.id = cta.tag_id
JOIN public.unified_tags ut ON ut.slug = ct.slug
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- From event tag assignments  
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT 
  ut.id as tag_id,
  eta.event_id as entity_id,
  'event' as entity_type
FROM public.event_tag_assignments eta
JOIN public.tags t ON t.id = eta.tag_id
JOIN public.unified_tags ut ON ut.slug = lower(replace(replace(replace(t.name, ' ', '-'), '&', 'and'), '''', ''))
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- From marketplace tag assignments
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT 
  ut.id as tag_id,
  mta.listing_id as entity_id,
  'marketplace_listing' as entity_type
FROM public.marketplace_tag_assignments mta
JOIN public.tags t ON t.id = mta.tag_id
JOIN public.unified_tags ut ON ut.slug = lower(replace(replace(replace(t.name, ' ', '-'), '&', 'and'), '''', ''))
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- From group tag assignments
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT 
  ut.id as tag_id,
  gta.group_id as entity_id,
  'community_group' as entity_type
FROM public.group_tag_assignments gta
JOIN public.tags t ON t.id = gta.tag_id
JOIN public.unified_tags ut ON ut.slug = lower(replace(replace(replace(t.name, ' ', '-'), '&', 'and'), '''', ''))
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- From news tag assignments
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT 
  ut.id as tag_id,
  nta.article_id as entity_id,
  'news_article' as entity_type
FROM public.news_tag_assignments nta
JOIN public.tags t ON t.id = nta.tag_id
JOIN public.unified_tags ut ON ut.slug = lower(replace(replace(replace(t.name, ' ', '-'), '&', 'and'), '''', ''))
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- From post tag assignments
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT 
  ut.id as tag_id,
  pta.post_id as entity_id,
  'community_post' as entity_type
FROM public.post_tag_assignments pta
JOIN public.tags t ON t.id = pta.tag_id
JOIN public.unified_tags ut ON ut.slug = lower(replace(replace(replace(t.name, ' ', '-'), '&', 'and'), '''', ''))
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- 6. Update the tag usage count function to work with unified system
CREATE OR REPLACE FUNCTION public.update_unified_tag_usage_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Update usage counts for unified tags
  UPDATE public.unified_tags 
  SET usage_count = (
    SELECT COUNT(*)
    FROM public.unified_tag_assignments 
    WHERE tag_id = unified_tags.id
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for unified tag usage count
DROP TRIGGER IF EXISTS update_unified_tag_usage_count_trigger ON public.unified_tag_assignments;
CREATE TRIGGER update_unified_tag_usage_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.unified_tag_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_unified_tag_usage_count();

-- Update updated_at timestamp trigger for unified tags
CREATE TRIGGER update_unified_tags_updated_at
  BEFORE UPDATE ON public.unified_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();