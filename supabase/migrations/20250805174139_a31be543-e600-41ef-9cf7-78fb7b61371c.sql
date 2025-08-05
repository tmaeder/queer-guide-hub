-- Create function for vector similarity search
CREATE OR REPLACE FUNCTION match_content_embeddings(
  query_embedding vector(1536),
  similarity_threshold float DEFAULT 0.1,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  content_id uuid,
  content_type text,
  content_text text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    public.content_embeddings.content_id,
    public.content_embeddings.content_type,
    public.content_embeddings.content_text,
    public.content_embeddings.metadata,
    1 - (public.content_embeddings.embedding <=> query_embedding) AS similarity
  FROM public.content_embeddings
  WHERE 1 - (public.content_embeddings.embedding <=> query_embedding) > similarity_threshold
  ORDER BY public.content_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;