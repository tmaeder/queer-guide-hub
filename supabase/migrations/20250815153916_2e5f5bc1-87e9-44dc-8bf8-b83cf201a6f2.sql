-- Add wikipedia_url column to unified_tags table
ALTER TABLE public.unified_tags 
ADD COLUMN wikipedia_url text;