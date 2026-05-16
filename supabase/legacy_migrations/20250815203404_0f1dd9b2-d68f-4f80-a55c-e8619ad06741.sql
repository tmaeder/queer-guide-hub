-- Add profile_url column to personalities table
ALTER TABLE public.personalities 
ADD COLUMN profile_url TEXT;