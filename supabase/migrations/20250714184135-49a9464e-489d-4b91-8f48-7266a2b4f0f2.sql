-- Update marketplace to only support products and services
-- Add constraint to limit categories to 'products' and 'services' only

-- First, update any existing listings that aren't products or services
UPDATE public.marketplace_listings 
SET category = CASE 
  WHEN category IN ('classes', 'events', 'consulting', 'digital') THEN 'services'
  ELSE category
END
WHERE category NOT IN ('products', 'services');

-- Add a check constraint to ensure only products and services are allowed
ALTER TABLE public.marketplace_listings 
ADD CONSTRAINT marketplace_category_check 
CHECK (category IN ('products', 'services'));

-- Update subcategories to be more relevant for products and services
-- For products: physical goods, digital products, handmade items, etc.
-- For services: professional services, creative services, wellness services, etc.