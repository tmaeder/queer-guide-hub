-- Create function to increment listing views
CREATE OR REPLACE FUNCTION increment_listing_views(listing_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.marketplace_listings 
  SET views_count = COALESCE(views_count, 0) + 1 
  WHERE id = listing_id;
END;
$$ LANGUAGE plpgsql;