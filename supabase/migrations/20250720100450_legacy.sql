-- Create an enum for user modes first
CREATE TYPE public.user_mode AS ENUM ('dating', 'friends', 'exploration', 'fun', 'networking', 'community');

-- Add user modes to profiles table with proper enum type
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS user_mode user_mode DEFAULT 'exploration';