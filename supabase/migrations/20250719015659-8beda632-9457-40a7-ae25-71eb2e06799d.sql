-- Add social media fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN social_links jsonb DEFAULT '{}'::jsonb;

-- Add some commonly used social media platform fields for easier querying
ALTER TABLE public.profiles 
ADD COLUMN twitter_username text,
ADD COLUMN instagram_username text,
ADD COLUMN linkedin_url text,
ADD COLUMN github_username text,
ADD COLUMN facebook_url text,
ADD COLUMN youtube_url text,
ADD COLUMN tiktok_username text,
ADD COLUMN website_url text;

-- Create index for better performance on social media searches
CREATE INDEX idx_profiles_social_links ON public.profiles USING GIN(social_links);
CREATE INDEX idx_profiles_twitter ON public.profiles(twitter_username) WHERE twitter_username IS NOT NULL;
CREATE INDEX idx_profiles_instagram ON public.profiles(instagram_username) WHERE instagram_username IS NOT NULL;
CREATE INDEX idx_profiles_github ON public.profiles(github_username) WHERE github_username IS NOT NULL;