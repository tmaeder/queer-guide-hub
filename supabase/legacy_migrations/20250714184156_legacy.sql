-- Update marketplace to only support products and services
-- First, map existing categories to products or services

UPDATE public.marketplace_listings 
SET category = CASE 
  WHEN category IN ('Art & Crafts', 'Books & Media', 'Fashion & Accessories', 'Health & Beauty') THEN 'products'
  WHEN category IN ('Services') THEN 'services'
  ELSE 'services'  -- Default any other categories to services
END;

-- Now add the constraint
ALTER TABLE public.marketplace_listings 
ADD CONSTRAINT marketplace_category_check 
CHECK (category IN ('products', 'services'));