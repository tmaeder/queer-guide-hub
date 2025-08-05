-- Add public read access for news articles so non-authenticated users can view them
CREATE POLICY "Public read access for news articles" 
ON public.news_articles 
FOR SELECT 
USING (true);