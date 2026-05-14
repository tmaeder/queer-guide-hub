-- Create unified knowledge base table
CREATE TABLE public.knowledge_base (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text GENERATED ALWAYS AS (lower(replace(trim(name), ' ', '-'))) STORED,
  description text,
  category text NOT NULL, -- 'event_type', 'venue_category', 'amenity', 'tag', 'accessibility', 'service'
  icon text,
  color text DEFAULT '#6366f1',
  image_url text,
  metadata jsonb DEFAULT '{}',
  usage_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  CONSTRAINT unique_name_category UNIQUE (name, category)
);

-- Enable RLS
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Knowledge base is viewable by everyone" 
ON public.knowledge_base 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage knowledge base" 
ON public.knowledge_base 
FOR ALL 
USING (has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "Authenticated users can view knowledge base" 
ON public.knowledge_base 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create indexes for performance
CREATE INDEX idx_knowledge_base_category ON public.knowledge_base(category);
CREATE INDEX idx_knowledge_base_slug ON public.knowledge_base(slug);
CREATE INDEX idx_knowledge_base_usage_count ON public.knowledge_base(usage_count DESC);
CREATE INDEX idx_knowledge_base_active ON public.knowledge_base(is_active) WHERE is_active = true;

-- Migrate data from existing tables
INSERT INTO public.knowledge_base (name, description, category, icon, color, is_active, sort_order)
SELECT 
  name,
  description,
  'event_type' as category,
  icon,
  color,
  is_active,
  sort_order
FROM public.event_types
WHERE name IS NOT NULL;

INSERT INTO public.knowledge_base (name, category, icon)
SELECT 
  name,
  'amenity' as category,
  icon_name as icon
FROM public.amenities
WHERE name IS NOT NULL;

INSERT INTO public.knowledge_base (name, description, category, icon, is_active, sort_order)
SELECT 
  name,
  description,
  'accessibility' as category,
  icon,
  is_active,
  sort_order
FROM public.accessibility_attributes
WHERE name IS NOT NULL;

INSERT INTO public.knowledge_base (name, description, category, icon, is_active, sort_order)
SELECT 
  name,
  description,
  'event_amenity' as category,
  icon,
  is_active,
  sort_order
FROM public.event_amenities
WHERE name IS NOT NULL;

INSERT INTO public.knowledge_base (name, description, category, icon, is_active, sort_order)
SELECT 
  name,
  description,
  'event_service' as category,
  icon,
  is_active,
  sort_order
FROM public.event_services
WHERE name IS NOT NULL;

INSERT INTO public.knowledge_base (name, description, category, icon, is_active, sort_order)
SELECT 
  name,
  description,
  CASE 
    WHEN type = 'venue' THEN 'venue_attribute'
    WHEN type = 'event' THEN 'event_attribute'
    ELSE 'attribute'
  END as category,
  icon,
  is_active,
  sort_order
FROM public.attributes
WHERE name IS NOT NULL;

-- Add some default venue categories if they don't exist
INSERT INTO public.knowledge_base (name, description, category, icon, color) VALUES
('Bar', 'Bars and pubs', 'venue_category', 'wine', '#ef4444'),
('Restaurant', 'Restaurants and cafes', 'venue_category', 'utensils', '#f97316'),
('Club', 'Nightclubs and dance venues', 'venue_category', 'music', '#8b5cf6'),
('Hotel', 'Hotels and accommodations', 'venue_category', 'bed', '#06b6d4'),
('Shop', 'Retail stores and boutiques', 'venue_category', 'shopping-bag', '#10b981'),
('Organization', 'Community organizations', 'venue_category', 'users', '#6366f1'),
('Health', 'Healthcare services', 'venue_category', 'heart', '#ec4899'),
('Culture', 'Museums and cultural venues', 'venue_category', 'building', '#84cc16')
ON CONFLICT (name, category) DO NOTHING;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_knowledge_base_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_knowledge_base_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.update_knowledge_base_updated_at();