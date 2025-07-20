-- Add user modes to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS user_mode TEXT DEFAULT 'exploration';

-- Create an enum for user modes
CREATE TYPE public.user_mode AS ENUM ('dating', 'friends', 'exploration', 'fun', 'networking', 'community');

-- Update the column to use the enum (after adding it)
ALTER TABLE public.profiles 
ALTER COLUMN user_mode TYPE user_mode USING user_mode::user_mode;