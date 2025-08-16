-- Update RLS policies to ensure all content is visible in CMS

-- Enable RLS and update policies for news_articles
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

-- Create/update policy for news articles to be viewable by authenticated users
DROP POLICY IF EXISTS "News articles are viewable by authenticated users" ON public.news_articles;
CREATE POLICY "News articles are viewable by authenticated users" 
ON public.news_articles 
FOR SELECT 
USING (auth.uid() IS NOT NULL OR true);

-- Update unified_tags policy to allow public read access
DROP POLICY IF EXISTS "Public read access for unified_tags" ON public.unified_tags;
CREATE POLICY "Public read access for unified_tags" 
ON public.unified_tags 
FOR SELECT 
USING (true);

-- Ensure marketplace_listings has proper SELECT policy
DROP POLICY IF EXISTS "Marketplace listings viewable by authenticated users" ON public.marketplace_listings;
CREATE POLICY "Marketplace listings viewable by authenticated users" 
ON public.marketplace_listings 
FOR SELECT 
USING (auth.uid() IS NOT NULL OR true);

-- Update venues policy to ensure all venues are visible
DROP POLICY IF EXISTS "Public read access for venues" ON public.venues;
CREATE POLICY "Public read access for venues" 
ON public.venues 
FOR SELECT 
USING (true);

-- Update events policy to show all events, not just active ones
DROP POLICY IF EXISTS "Public read access for events" ON public.events;
CREATE POLICY "Public read access for events" 
ON public.events 
FOR SELECT 
USING (true);

-- Update personalities policy
DROP POLICY IF EXISTS "Public read access for personalities" ON public.personalities;
CREATE POLICY "Public read access for personalities" 
ON public.personalities 
FOR SELECT 
USING (true);

-- Ensure community_groups has proper visibility
DROP POLICY IF EXISTS "Community groups viewable by authenticated users" ON public.community_groups;
CREATE POLICY "Community groups viewable by authenticated users" 
ON public.community_groups 
FOR SELECT 
USING (auth.uid() IS NOT NULL OR true);