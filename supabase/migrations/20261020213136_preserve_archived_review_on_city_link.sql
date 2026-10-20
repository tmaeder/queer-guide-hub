-- A city correction must not republish an editorially archived venue, event,
-- or personality. Keep the existing auto-approval behavior for other rows.
CREATE OR REPLACE FUNCTION public.auto_approve_on_city_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.city_id IS NOT NULL
     AND OLD.city_id IS DISTINCT FROM NEW.city_id
     AND OLD.review_status IS DISTINCT FROM 'archived'
     AND NEW.review_status IS DISTINCT FROM 'archived' THEN
    NEW.review_status := 'approved';
  END IF;
  RETURN NEW;
END;
$function$;
