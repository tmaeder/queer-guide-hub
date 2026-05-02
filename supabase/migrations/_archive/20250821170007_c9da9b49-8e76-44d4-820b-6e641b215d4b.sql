-- Fix security issue: Set search_path for function
CREATE OR REPLACE FUNCTION public.update_admin_api_keys_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;