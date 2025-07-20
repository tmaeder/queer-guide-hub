-- Add online status field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false;

-- Add last seen timestamp
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone DEFAULT now();