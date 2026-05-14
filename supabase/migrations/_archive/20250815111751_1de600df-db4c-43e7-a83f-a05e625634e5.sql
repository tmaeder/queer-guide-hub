-- Fix function search path for security
CREATE OR REPLACE FUNCTION public.increment_personality_views(personality_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  UPDATE public.personalities 
  SET view_count = view_count + 1,
      updated_at = now()
  WHERE id = personality_id;
$$;