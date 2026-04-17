-- Create news sources table
CREATE TABLE public.news_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'rss', -- 'rss', 'api', 'manual'
  category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  fetch_frequency INTEGER NOT NULL DEFAULT 60, -- minutes
  last_fetched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create news articles table
CREATE TABLE public.news_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.news_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  excerpt TEXT,
  url TEXT NOT NULL UNIQUE,
  image_url TEXT,
  author TEXT,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  country_ids UUID[] DEFAULT '{}',
  city_ids UUID[] DEFAULT '{}',
  sentiment TEXT, -- 'positive', 'neutral', 'negative'
  is_featured BOOLEAN DEFAULT false,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create news categories table
CREATE TABLE public.news_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT,
  parent_category_id UUID REFERENCES public.news_categories(id),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default LGBT+ news categories
INSERT INTO public.news_categories (name, slug, description, color, icon) VALUES
('Rights & Legal', 'rights-legal', 'Legal developments and rights advocacy', '#ef4444', 'scale'),
('Health & Wellness', 'health-wellness', 'Health topics and wellness resources', '#10b981', 'heart'),
('Politics', 'politics', 'Political news and policy updates', '#3b82f6', 'vote'),
('Culture & Arts', 'culture-arts', 'Cultural events and artistic expression', '#8b5cf6', 'palette'),
('Business & Economy', 'business-economy', 'Economic and business developments', '#f59e0b', 'briefcase'),
('Education', 'education', 'Educational initiatives and campus news', '#06b6d4', 'graduation-cap'),
('Community', 'community', 'Local community news and events', '#ec4899', 'users'),
('International', 'international', 'Global LGBT+ news and developments', '#14b8a6', 'globe'),
('Technology', 'technology', 'Tech industry and digital rights', '#6366f1', 'smartphone'),
('Sports', 'sports', 'Sports and athletics coverage', '#f97316', 'trophy');

-- Enable RLS
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for news_sources
CREATE POLICY "News sources are viewable by everyone" ON public.news_sources
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage news sources" ON public.news_sources
  FOR ALL USING (true);

-- RLS Policies for news_articles
CREATE POLICY "News articles are viewable by everyone" ON public.news_articles
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage news articles" ON public.news_articles
  FOR ALL USING (true);

-- RLS Policies for news_categories
CREATE POLICY "News categories are viewable by everyone" ON public.news_categories
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage news categories" ON public.news_categories
  FOR ALL USING (true);

-- Create indexes for better performance
CREATE INDEX idx_news_articles_published_at ON public.news_articles(published_at DESC);
CREATE INDEX idx_news_articles_category ON public.news_articles(category);
CREATE INDEX idx_news_articles_tags ON public.news_articles USING GIN(tags);
CREATE INDEX idx_news_articles_country_ids ON public.news_articles USING GIN(country_ids);
CREATE INDEX idx_news_articles_city_ids ON public.news_articles USING GIN(city_ids);
CREATE INDEX idx_news_articles_source_id ON public.news_articles(source_id);
CREATE INDEX idx_news_sources_is_active ON public.news_sources(is_active);

-- Create triggers for updated_at
CREATE TRIGGER update_news_sources_updated_at
  BEFORE UPDATE ON public.news_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_news_articles_updated_at
  BEFORE UPDATE ON public.news_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_news_categories_updated_at
  BEFORE UPDATE ON public.news_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to increment article views
CREATE OR REPLACE FUNCTION public.increment_article_views(article_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.news_articles 
  SET views_count = COALESCE(views_count, 0) + 1 
  WHERE id = article_id;
END;
$$;