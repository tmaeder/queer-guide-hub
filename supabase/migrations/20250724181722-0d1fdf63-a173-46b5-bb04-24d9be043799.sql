-- First, let's check if tag_categories already exists and handle it properly
DO $$ 
BEGIN 
  -- Drop and recreate tag_categories table with correct structure
  DROP TABLE IF EXISTS public.tag_categories CASCADE;
  
  CREATE TABLE public.tag_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  );
END $$;

-- Enable RLS on tag_categories
ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;

-- Add category_id to unified_tags if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'unified_tags' AND column_name = 'category_id') THEN
    ALTER TABLE public.unified_tags ADD COLUMN category_id UUID REFERENCES public.tag_categories(id);
  END IF;
END $$;

-- Insert default tag categories with slugs
INSERT INTO public.tag_categories (name, slug, description) VALUES
  ('Interests', 'interests', 'Personal interests and hobbies'),
  ('Event Topics', 'event-topics', 'Categories for events and activities'),
  ('Venue Types', 'venue-types', 'Types and characteristics of venues'),
  ('News Topics', 'news-topics', 'News article categories and subjects'),
  ('Products', 'products', 'Product categories and types'),
  ('Services', 'services', 'Service categories and types'),
  ('Identity', 'identity', 'Identity-related tags'),
  ('Activism', 'activism', 'Activism and advocacy topics'),
  ('Culture', 'culture', 'Cultural topics and themes'),
  ('Health', 'health', 'Health and wellness topics')
ON CONFLICT (name) DO NOTHING;

-- Create attributes table to replace separate amenities/services
CREATE TABLE IF NOT EXISTS public.attributes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  type TEXT NOT NULL CHECK (type IN ('amenity', 'service', 'accessibility', 'feature')),
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(name, type)
);

-- Enable RLS on attributes
ALTER TABLE public.attributes ENABLE ROW LEVEL SECURITY;

-- Create entity_attribute_assignments linking table
CREATE TABLE IF NOT EXISTS public.entity_attribute_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attribute_id UUID NOT NULL REFERENCES public.attributes(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event', 'venue', 'marketplace_listing', 'user', 'group')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(attribute_id, entity_id, entity_type)
);

-- Enable RLS on entity_attribute_assignments
ALTER TABLE public.entity_attribute_assignments ENABLE ROW LEVEL SECURITY;

-- Migrate existing data from event_amenities to attributes
INSERT INTO public.attributes (name, description, icon, type, category, is_active, sort_order)
SELECT DISTINCT name, description, icon, 'amenity', category, is_active, sort_order
FROM public.event_amenities
WHERE is_active = true
ON CONFLICT (name, type) DO NOTHING;

-- Migrate existing data from event_services to attributes
INSERT INTO public.attributes (name, description, icon, type, category, is_active, sort_order)
SELECT DISTINCT name, description, icon, 'service', category, is_active, sort_order
FROM public.event_services
WHERE is_active = true
ON CONFLICT (name, type) DO NOTHING;

-- Migrate existing data from accessibility_attributes to attributes
INSERT INTO public.attributes (name, description, icon, type, category, is_active, sort_order)
SELECT DISTINCT name, description, icon, 'accessibility', category, is_active, sort_order
FROM public.accessibility_attributes
WHERE is_active = true
ON CONFLICT (name, type) DO NOTHING;

-- Create news_article_countries linking table
CREATE TABLE IF NOT EXISTS public.news_article_countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(article_id, country_id)
);

-- Enable RLS on news_article_countries
ALTER TABLE public.news_article_countries ENABLE ROW LEVEL SECURITY;

-- Create news_article_cities linking table
CREATE TABLE IF NOT EXISTS public.news_article_cities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(article_id, city_id)
);

-- Enable RLS on news_article_cities
ALTER TABLE public.news_article_cities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Tag categories are viewable by everyone" 
ON public.tag_categories FOR SELECT USING (true);

CREATE POLICY "Admins can manage tag categories" 
ON public.tag_categories FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Attributes are viewable by everyone" 
ON public.attributes FOR SELECT USING (true);

CREATE POLICY "Admins can manage attributes" 
ON public.attributes FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entity attribute assignments are viewable by everyone" 
ON public.entity_attribute_assignments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage entity attributes" 
ON public.entity_attribute_assignments FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "News article countries are viewable by everyone" 
ON public.news_article_countries FOR SELECT USING (true);

CREATE POLICY "Admins can manage news article countries" 
ON public.news_article_countries FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "News article cities are viewable by everyone" 
ON public.news_article_cities FOR SELECT USING (true);

CREATE POLICY "Admins can manage news article cities" 
ON public.news_article_cities FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_unified_tags_category_id ON public.unified_tags(category_id);
CREATE INDEX IF NOT EXISTS idx_unified_tags_usage_count ON public.unified_tags(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_unified_tag_assignments_entity ON public.unified_tag_assignments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_unified_tag_assignments_tag_id ON public.unified_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_attributes_type ON public.attributes(type);
CREATE INDEX IF NOT EXISTS idx_attributes_type_active ON public.attributes(type, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_entity_attr_assignments_entity ON public.entity_attribute_assignments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_attr_assignments_attr_id ON public.entity_attribute_assignments(attribute_id);
CREATE INDEX IF NOT EXISTS idx_news_article_countries_article ON public.news_article_countries(article_id);
CREATE INDEX IF NOT EXISTS idx_news_article_countries_country ON public.news_article_countries(country_id);
CREATE INDEX IF NOT EXISTS idx_news_article_cities_article ON public.news_article_cities(article_id);
CREATE INDEX IF NOT EXISTS idx_news_article_cities_city ON public.news_article_cities(city_id);

-- Add update triggers
CREATE TRIGGER update_tag_categories_updated_at
  BEFORE UPDATE ON public.tag_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attributes_updated_at
  BEFORE UPDATE ON public.attributes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create helper functions
CREATE OR REPLACE FUNCTION public.get_entity_tags(entity_id_param UUID, entity_type_param TEXT)
RETURNS TABLE(
  tag_id UUID,
  tag_name TEXT,
  tag_description TEXT,
  tag_color TEXT,
  category_name TEXT
) 
LANGUAGE SQL
STABLE SECURITY DEFINER
AS $$
  SELECT 
    ut.id,
    ut.name,
    ut.description,
    ut.color,
    tc.name as category_name
  FROM public.unified_tag_assignments uta
  JOIN public.unified_tags ut ON uta.tag_id = ut.id
  LEFT JOIN public.tag_categories tc ON ut.category_id = tc.id
  WHERE uta.entity_id = entity_id_param 
    AND uta.entity_type = entity_type_param;
$$;

CREATE OR REPLACE FUNCTION public.get_entity_attributes(entity_id_param UUID, entity_type_param TEXT)
RETURNS TABLE(
  attribute_id UUID,
  attribute_name TEXT,
  attribute_description TEXT,
  attribute_icon TEXT,
  attribute_type TEXT,
  attribute_category TEXT
) 
LANGUAGE SQL
STABLE SECURITY DEFINER
AS $$
  SELECT 
    a.id,
    a.name,
    a.description,
    a.icon,
    a.type,
    a.category
  FROM public.entity_attribute_assignments eaa
  JOIN public.attributes a ON eaa.attribute_id = a.id
  WHERE eaa.entity_id = entity_id_param 
    AND eaa.entity_type = entity_type_param
    AND a.is_active = true;
$$;