-- Drop the conflicting authenticated user policy
DROP POLICY IF EXISTS "News articles are viewable by authenticated users" ON news_articles;

-- Ensure the public read policy is the only one needed for SELECT
DROP POLICY IF EXISTS "Public read access for news articles" ON news_articles;

-- Create a single, clear public read policy
CREATE POLICY "Public can view all published news articles" 
ON news_articles 
FOR SELECT 
TO public
USING (true);

-- Also ensure news sources, categories can be read publicly
DROP POLICY IF EXISTS "Public read access" ON news_sources;
CREATE POLICY "Public can view news sources" 
ON news_sources 
FOR SELECT 
TO public
USING (is_active = true);

DROP POLICY IF EXISTS "Public read access" ON news_categories;
CREATE POLICY "Public can view news categories" 
ON news_categories 
FOR SELECT 
TO public
USING (is_active = true);

-- Ensure unified_tags can be read publicly for news tagging
DROP POLICY IF EXISTS "Public read access" ON unified_tags;
CREATE POLICY "Public can view tags" 
ON unified_tags 
FOR SELECT 
TO public
USING (true);

-- Ensure unified_tag_assignments can be read publicly
DROP POLICY IF EXISTS "Public read access" ON unified_tag_assignments;
CREATE POLICY "Public can view tag assignments" 
ON unified_tag_assignments 
FOR SELECT 
TO public
USING (true);