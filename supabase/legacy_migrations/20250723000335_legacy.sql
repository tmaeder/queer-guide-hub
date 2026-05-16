-- Update marketplace_listings table to reference categories table
ALTER TABLE public.marketplace_listings 
ADD COLUMN category_id UUID REFERENCES public.marketplace_categories(id);

-- Update existing listings to use category IDs instead of text
UPDATE public.marketplace_listings 
SET category_id = (
  SELECT id FROM public.marketplace_categories 
  WHERE lower(name) LIKE CASE 
    WHEN marketplace_listings.category = 'clothing' THEN '%clothing%'
    WHEN marketplace_listings.category = 'books' THEN '%books%'
    WHEN marketplace_listings.category = 'health' THEN '%health%'
    WHEN marketplace_listings.category = 'technology' THEN '%technology%'
    WHEN marketplace_listings.category = 'art' THEN '%art%'
    WHEN marketplace_listings.category = 'services' THEN '%services%'
    WHEN marketplace_listings.category = 'food_beverage' THEN '%food%'
    WHEN marketplace_listings.category = 'home_garden' THEN '%home%'
    WHEN marketplace_listings.category = 'entertainment' THEN '%entertainment%'
    ELSE '%other%'
  END
  LIMIT 1
);

-- Set default category for any listings without a match
UPDATE public.marketplace_listings 
SET category_id = (SELECT id FROM public.marketplace_categories WHERE slug = 'other' LIMIT 1)
WHERE category_id IS NULL;