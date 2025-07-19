-- Create function to get tag relationships
CREATE OR REPLACE FUNCTION get_tag_relationships()
RETURNS TABLE (
  id UUID,
  tag1_id UUID,
  tag2_id UUID,
  similarity_score NUMERIC,
  relationship_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT 
    tr.id,
    tr.tag1_id,
    tr.tag2_id,
    tr.similarity_score,
    tr.relationship_type,
    tr.created_at
  FROM public.tag_relationships tr
  ORDER BY tr.similarity_score DESC;
$$;