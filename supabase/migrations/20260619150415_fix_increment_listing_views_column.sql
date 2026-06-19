-- increment_listing_views referenced a nonexistent column `view_count`; the real
-- column on marketplace_listings is `views_count`. Every product-page view-track
-- call (useMarketplace.incrementViews) was 400-ing on the bad column reference.
-- Fix the column name.
CREATE OR REPLACE FUNCTION public.increment_listing_views(listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.marketplace_listings SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = increment_listing_views.listing_id;
END;
$function$;
