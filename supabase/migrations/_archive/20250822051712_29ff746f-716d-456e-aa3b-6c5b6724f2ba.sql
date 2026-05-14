-- Add avatar_type column to profiles table if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS avatar_type TEXT CHECK (avatar_type IN ('upload', 'builder', 'gravatar'));