-- Create marketplace categories table
CREATE TABLE public.marketplace_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES public.marketplace_categories(id),
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketplace_categories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Categories are viewable by everyone" 
ON public.marketplace_categories 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage categories" 
ON public.marketplace_categories 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes
CREATE INDEX idx_marketplace_categories_parent_id ON public.marketplace_categories(parent_id);
CREATE INDEX idx_marketplace_categories_slug ON public.marketplace_categories(slug);
CREATE INDEX idx_marketplace_categories_sort_order ON public.marketplace_categories(sort_order);

-- Create trigger for updated_at
CREATE TRIGGER update_marketplace_categories_updated_at
BEFORE UPDATE ON public.marketplace_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default categories based on common marketplace needs
INSERT INTO public.marketplace_categories (name, slug, description, sort_order) VALUES
('Clothing & Fashion', 'clothing-fashion', 'Apparel, accessories, and fashion items', 1),
('Books & Literature', 'books-literature', 'Books, magazines, and reading materials', 2),
('Health & Beauty', 'health-beauty', 'Health products, cosmetics, and beauty items', 3),
('Technology', 'technology', 'Electronics, gadgets, and tech accessories', 4),
('Art & Crafts', 'art-crafts', 'Artwork, craft supplies, and creative items', 5),
('Services', 'services', 'Professional and personal services', 6),
('Food & Beverage', 'food-beverage', 'Food products, drinks, and culinary items', 7),
('Home & Garden', 'home-garden', 'Home decor, furniture, and garden supplies', 8),
('Entertainment', 'entertainment', 'Games, music, movies, and entertainment items', 9),
('Other', 'other', 'Miscellaneous items not fitting other categories', 99);

-- Function to get or create category
CREATE OR REPLACE FUNCTION public.get_or_create_marketplace_category(
  category_name TEXT,
  parent_category_name TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  category_id UUID;
  parent_id UUID;
  category_slug TEXT;
BEGIN
  -- Clean and create slug from category name
  category_slug := lower(regexp_replace(trim(category_name), '[^a-zA-Z0-9]+', '-', 'g'));
  category_slug := regexp_replace(category_slug, '^-+|-+$', '', 'g');
  
  -- Get parent category if specified
  IF parent_category_name IS NOT NULL AND parent_category_name != '' THEN
    SELECT id INTO parent_id 
    FROM public.marketplace_categories 
    WHERE lower(name) = lower(trim(parent_category_name)) 
    LIMIT 1;
    
    -- Create parent if it doesn't exist
    IF parent_id IS NULL THEN
      INSERT INTO public.marketplace_categories (name, slug, parent_id)
      VALUES (
        trim(parent_category_name), 
        lower(regexp_replace(trim(parent_category_name), '[^a-zA-Z0-9]+', '-', 'g')),
        NULL
      )
      RETURNING id INTO parent_id;
    END IF;
  END IF;
  
  -- Check if category already exists
  SELECT id INTO category_id 
  FROM public.marketplace_categories 
  WHERE lower(name) = lower(trim(category_name))
  LIMIT 1;
  
  -- Create category if it doesn't exist
  IF category_id IS NULL THEN
    INSERT INTO public.marketplace_categories (name, slug, parent_id)
    VALUES (trim(category_name), category_slug, parent_id)
    RETURNING id INTO category_id;
  END IF;
  
  RETURN category_id;
END;
$$;