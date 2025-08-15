-- Add top_book column to personalities table for storing authors' most notable works
ALTER TABLE public.personalities 
ADD COLUMN top_book TEXT;