-- Create function to create tag relationships table if it doesn't exist
CREATE OR REPLACE FUNCTION create_tag_relationships_table_if_not_exists()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Create the tag_relationships table if it doesn't exist
  CREATE TABLE IF NOT EXISTS public.tag_relationships (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tag1_id UUID NOT NULL,
    tag2_id UUID NOT NULL,
    similarity_score NUMERIC(5,4) NOT NULL,
    relationship_type TEXT NOT NULL DEFAULT 'semantic',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tag1_id, tag2_id)
  );

  -- Enable RLS
  ALTER TABLE public.tag_relationships ENABLE ROW LEVEL SECURITY;

  -- Create RLS policy for viewing relationships
  DROP POLICY IF EXISTS "Tag relationships are viewable by everyone" ON public.tag_relationships;
  CREATE POLICY "Tag relationships are viewable by everyone" 
  ON public.tag_relationships 
  FOR SELECT 
  USING (true);

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_tag_relationships_tag1_id ON public.tag_relationships(tag1_id);
  CREATE INDEX IF NOT EXISTS idx_tag_relationships_tag2_id ON public.tag_relationships(tag2_id);
  CREATE INDEX IF NOT EXISTS idx_tag_relationships_similarity ON public.tag_relationships(similarity_score DESC);
END;
$$;