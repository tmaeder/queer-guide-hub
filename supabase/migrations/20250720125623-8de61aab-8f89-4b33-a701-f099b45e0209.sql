-- Create tag categories table
CREATE TABLE IF NOT EXISTS public.tag_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Tag categories are viewable by everyone" 
ON public.tag_categories 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage tag categories" 
ON public.tag_categories 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add category_id to unified_tags table
ALTER TABLE public.unified_tags 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.tag_categories(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_unified_tags_category_id ON public.unified_tags(category_id);

-- Insert the tag categories
INSERT INTO public.tag_categories (name, slug, description, sort_order) VALUES
('Consent', 'consent', 'Tags related to consent and communication', 1),
('Genders', 'genders', 'Gender identity and expression tags', 2),
('Sexual Orientations', 'sexual-orientations', 'Sexual orientation and attraction tags', 3),
('Romantic Orientations', 'romantic-orientations', 'Romantic orientation and relationship tags', 4),
('Relationships', 'relationships', 'Relationship structure and dynamic tags', 5),
('Roles', 'roles', 'Role-based and dynamic tags', 6),
('Gay Culture', 'gay-culture', 'LGBTQ+ culture and community tags', 7),
('Kink Activities', 'kink-activities', 'Kink and BDSM activity tags', 8),
('Sexual Activities', 'sexual-activities', 'Sexual activity and practice tags', 9),
('Philia', 'philia', 'Specific attraction and interest tags', 10),
('Toys & Equipment', 'toys-equipment', 'Toys, tools, and equipment tags', 11),
('Play Spaces', 'play-spaces', 'Location and space-related tags', 12),
('Events', 'events', 'Event and gathering tags', 13),
('Holidays', 'holidays', 'Holiday and celebration tags', 14),
('Sexual Health', 'sexual-health', 'Sexual health and wellness tags', 15),
('Mental Health', 'mental-health', 'Mental health and wellbeing tags', 16),
('Scene Safety', 'scene-safety', 'Safety practices and protocols', 17),
('Safety Resources', 'safety-resources', 'Safety tools and resources', 18);

-- Create trigger for updated_at
CREATE TRIGGER update_tag_categories_updated_at
  BEFORE UPDATE ON public.tag_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();