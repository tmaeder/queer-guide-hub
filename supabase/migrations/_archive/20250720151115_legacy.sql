-- Add tags column to community_groups table
ALTER TABLE public.community_groups 
ADD COLUMN tags TEXT[] DEFAULT '{}';

-- Create index for better performance when filtering by tags
CREATE INDEX IF NOT EXISTS idx_community_groups_tags ON public.community_groups USING GIN(tags);