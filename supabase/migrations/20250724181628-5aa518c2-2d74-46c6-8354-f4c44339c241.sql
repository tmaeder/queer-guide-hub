-- 1. UNIFIED TAGGING SYSTEM IMPROVEMENTS

-- Create tag_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.tag_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

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

-- Insert default tag categories
INSERT INTO public.tag_categories (name, description) VALUES
  ('Interests', 'Personal interests and hobbies'),
  ('Event Topics', 'Categories for events and activities'),
  ('Venue Types', 'Types and characteristics of venues'),
  ('News Topics', 'News article categories and subjects'),
  ('Products', 'Product categories and types'),
  ('Services', 'Service categories and types'),
  ('Identity', 'Identity-related tags'),
  ('Activism', 'Activism and advocacy topics'),
  ('Culture', 'Cultural topics and themes'),
  ('Health', 'Health and wellness topics')
ON CONFLICT (name) DO NOTHING;

-- 2. UNIFIED ATTRIBUTES SYSTEM

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

-- 3. GEOGRAPHIC TAGGING FOR NEWS ARTICLES

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

-- 4. CREATE RLS POLICIES

-- Tag categories policies
CREATE POLICY "Tag categories are viewable by everyone" 
ON public.tag_categories FOR SELECT USING (true);

CREATE POLICY "Admins can manage tag categories" 
ON public.tag_categories FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Attributes policies
CREATE POLICY "Attributes are viewable by everyone" 
ON public.attributes FOR SELECT USING (true);

CREATE POLICY "Admins can manage attributes" 
ON public.attributes FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Entity attribute assignments policies
CREATE POLICY "Entity attribute assignments are viewable by everyone" 
ON public.entity_attribute_assignments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage entity attributes" 
ON public.entity_attribute_assignments FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- News article geographic tagging policies
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

-- 5. CREATE INDEXES FOR PERFORMANCE

-- Indexes for unified_tags
CREATE INDEX IF NOT EXISTS idx_unified_tags_category_id ON public.unified_tags(category_id);
CREATE INDEX IF NOT EXISTS idx_unified_tags_usage_count ON public.unified_tags(usage_count DESC);

-- Indexes for unified_tag_assignments
CREATE INDEX IF NOT EXISTS idx_unified_tag_assignments_entity ON public.unified_tag_assignments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_unified_tag_assignments_tag_id ON public.unified_tag_assignments(tag_id);

-- Indexes for attributes
CREATE INDEX IF NOT EXISTS idx_attributes_type ON public.attributes(type);
CREATE INDEX IF NOT EXISTS idx_attributes_type_active ON public.attributes(type, is_active) WHERE is_active = true;

-- Indexes for entity_attribute_assignments
CREATE INDEX IF NOT EXISTS idx_entity_attr_assignments_entity ON public.entity_attribute_assignments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_attr_assignments_attr_id ON public.entity_attribute_assignments(attribute_id);

-- Indexes for news article geographic tagging
CREATE INDEX IF NOT EXISTS idx_news_article_countries_article ON public.news_article_countries(article_id);
CREATE INDEX IF NOT EXISTS idx_news_article_countries_country ON public.news_article_countries(country_id);
CREATE INDEX IF NOT EXISTS idx_news_article_cities_article ON public.news_article_cities(article_id);
CREATE INDEX IF NOT EXISTS idx_news_article_cities_city ON public.news_article_cities(city_id);

-- 6. UPDATE TRIGGERS

-- Add update trigger for tag_categories
CREATE TRIGGER update_tag_categories_updated_at
  BEFORE UPDATE ON public.tag_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add update trigger for attributes
CREATE TRIGGER update_attributes_updated_at
  BEFORE UPDATE ON public.attributes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. CREATE FUNCTIONS FOR EASIER DATA ACCESS

-- Function to get tags for an entity
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

-- Function to get attributes for an entity
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