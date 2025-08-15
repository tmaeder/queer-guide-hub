-- Add next_concerts column to personalities table for storing upcoming concerts from Bandsintown
ALTER TABLE public.personalities 
ADD COLUMN next_concerts JSONB DEFAULT '[]'::jsonb;