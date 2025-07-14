-- Consolidate all tags to use the centralized tags table
-- This migration will create proper junction tables and migrate existing tag data

-- First, migrate content_tags data to the main tags table if not already there
INSERT INTO public.tags (name, slug, category, description, created_at)
SELECT 
  ct.name,
  ct.slug,
  'content' as category,
  'Migrated from content_tags' as description,
  ct.created_at
FROM public.content_tags ct
WHERE NOT EXISTS (
  SELECT 1 FROM public.tags t WHERE t.name = ct.name
);

-- Create junction tables for proper tag relationships
CREATE TABLE IF NOT EXISTS public.event_tag_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(event_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.venue_tag_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(venue_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_tag_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(listing_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.post_tag_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.group_tag_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(group_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.news_tag_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(article_id, tag_id)
);

-- Enable RLS on all new junction tables
ALTER TABLE public.event_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_tag_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tag assignments
-- Event tag assignments
CREATE POLICY "Event tag assignments are viewable by everyone" ON public.event_tag_assignments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage event tag assignments" ON public.event_tag_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND created_by = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND created_by = auth.uid())
);

-- Venue tag assignments
CREATE POLICY "Venue tag assignments are viewable by everyone" ON public.venue_tag_assignments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage venue tag assignments" ON public.venue_tag_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND created_by = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND created_by = auth.uid())
);

-- Marketplace tag assignments
CREATE POLICY "Marketplace tag assignments are viewable by everyone" ON public.marketplace_tag_assignments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage marketplace tag assignments" ON public.marketplace_tag_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.marketplace_listings WHERE id = listing_id AND created_by = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.marketplace_listings WHERE id = listing_id AND created_by = auth.uid())
);

-- Post tag assignments
CREATE POLICY "Post tag assignments are viewable by everyone" ON public.post_tag_assignments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage post tag assignments" ON public.post_tag_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.community_posts WHERE id = post_id AND user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.community_posts WHERE id = post_id AND user_id = auth.uid())
);

-- Group tag assignments
CREATE POLICY "Group tag assignments are viewable by everyone" ON public.group_tag_assignments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage group tag assignments" ON public.group_tag_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.community_groups WHERE id = group_id AND created_by = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.community_groups WHERE id = group_id AND created_by = auth.uid())
);

-- News tag assignments
CREATE POLICY "News tag assignments are viewable by everyone" ON public.news_tag_assignments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage news tag assignments" ON public.news_tag_assignments FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Update the existing content_category_assignments to use the main tags table
-- First, update content_tag_assignments to reference the main tags table
UPDATE public.content_tag_assignments 
SET tag_id = (
  SELECT t.id 
  FROM public.tags t 
  JOIN public.content_tags ct ON t.name = ct.name 
  WHERE ct.id = content_tag_assignments.tag_id
)
WHERE EXISTS (
  SELECT 1 
  FROM public.content_tags ct 
  JOIN public.tags t ON t.name = ct.name 
  WHERE ct.id = content_tag_assignments.tag_id
);

-- Add some common default tags if they don't exist
INSERT INTO public.tags (name, category, description, color) VALUES
  ('Technology', 'general', 'Technology and innovation related content', '#3B82F6'),
  ('Community', 'general', 'Community building and social topics', '#10B981'),
  ('Travel', 'general', 'Travel and exploration content', '#F59E0B'),
  ('Food', 'general', 'Food and dining related content', '#EF4444'),
  ('Entertainment', 'general', 'Entertainment and leisure activities', '#8B5CF6'),
  ('Business', 'general', 'Business and professional topics', '#6B7280'),
  ('Health', 'general', 'Health and wellness content', '#84CC16'),
  ('Education', 'general', 'Educational and learning content', '#06B6D4'),
  ('Arts', 'general', 'Arts and culture content', '#EC4899'),
  ('Sports', 'general', 'Sports and fitness content', '#F97316')
ON CONFLICT (name) DO NOTHING;

-- Update usage counts for all tags
UPDATE public.tags SET usage_count = (
  COALESCE((SELECT COUNT(*) FROM public.events WHERE tags @> ARRAY[tags.name]), 0) +
  COALESCE((SELECT COUNT(*) FROM public.venues WHERE tags @> ARRAY[tags.name]), 0) +
  COALESCE((SELECT COUNT(*) FROM public.marketplace_listings WHERE tags @> ARRAY[tags.name]), 0) +
  COALESCE((SELECT COUNT(*) FROM public.community_posts WHERE tags @> ARRAY[tags.name]), 0) +
  COALESCE((SELECT COUNT(*) FROM public.community_groups WHERE tags @> ARRAY[tags.name]), 0) +
  COALESCE((SELECT COUNT(*) FROM public.news_articles WHERE tags @> ARRAY[tags.name]), 0) +
  COALESCE((SELECT COUNT(*) FROM public.content_tag_assignments cta WHERE cta.tag_id = tags.id), 0)
);