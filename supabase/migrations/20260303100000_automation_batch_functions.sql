-- Batch apply all auto_approved changes for a given batch_id in one call.
-- Replaces N+1 apply_content_change calls with a single RPC.
CREATE OR REPLACE FUNCTION public.bulk_apply_batch_changes(p_batch_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_applied INT := 0;
  v_id UUID;
BEGIN
  FOR v_id IN
    SELECT id FROM public.content_changes
    WHERE batch_id = p_batch_id AND status = 'auto_approved'
    ORDER BY created_at
  LOOP
    BEGIN
      IF public.apply_content_change(v_id) THEN
        v_applied := v_applied + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'bulk_apply_batch skipped %: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_applied;
END;
$$;

-- Batch match tag embeddings for multiple content items at once.
-- Eliminates N+1 per-item embedding lookups in the auto-tagger.
-- Returns top matches per content_id using LATERAL join.
CREATE OR REPLACE FUNCTION public.batch_match_tag_embeddings(
  p_content_type TEXT,
  p_content_ids UUID[],
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 8
)
RETURNS TABLE(
  content_id UUID,
  tag_id UUID,
  tag_name TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.content_id,
    sub.tag_id,
    sub.tag_name,
    sub.similarity
  FROM public.content_embeddings ce
  CROSS JOIN LATERAL (
    SELECT
      te.tag_id,
      t.name AS tag_name,
      (1 - (ce.embedding <=> te.embedding))::FLOAT AS similarity
    FROM public.tag_embeddings te
    JOIN public.unified_tags t ON t.id = te.tag_id
    WHERE (1 - (ce.embedding <=> te.embedding)) >= p_match_threshold
    ORDER BY ce.embedding <=> te.embedding
    LIMIT p_match_count
  ) sub
  WHERE ce.content_type = p_content_type
    AND ce.content_id = ANY(p_content_ids);
END;
$$;

-- Add index on content_changes.batch_id for the bulk apply function
CREATE INDEX IF NOT EXISTS idx_content_changes_batch_id
  ON public.content_changes(batch_id)
  WHERE batch_id IS NOT NULL;
