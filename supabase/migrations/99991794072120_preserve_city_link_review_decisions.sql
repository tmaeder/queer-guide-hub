-- A city link can resolve a pending geography review. Preserve existing
-- editorial decisions and explicit review-status changes during relinking.
CREATE OR REPLACE FUNCTION public.auto_approve_on_city_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.city_id IS NOT NULL
     AND OLD.city_id IS DISTINCT FROM NEW.city_id
     AND COALESCE(OLD.review_status, 'pending') = 'pending'
     AND NEW.review_status IS NOT DISTINCT FROM OLD.review_status THEN
    NEW.review_status := 'approved';
  END IF;
  RETURN NEW;
END;
$function$;
