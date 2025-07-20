-- Add tags column to news_articles table
ALTER TABLE public.news_articles 
ADD COLUMN tags TEXT[] DEFAULT '{}';

-- Add index for better performance on tags
CREATE INDEX IF NOT EXISTS idx_news_articles_tags ON public.news_articles USING GIN(tags);