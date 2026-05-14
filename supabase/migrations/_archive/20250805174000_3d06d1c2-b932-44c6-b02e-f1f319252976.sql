-- Fix function search path mutable warning by setting search_path
CREATE OR REPLACE FUNCTION public.update_content_embeddings_updated_at()
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

-- Move vector extension to extensions schema instead of public
DROP EXTENSION IF EXISTS vector;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;