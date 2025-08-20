-- Fix search path security issue for the function
DROP FUNCTION IF EXISTS update_placeholder_images_updated_at();

CREATE OR REPLACE FUNCTION update_placeholder_images_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;