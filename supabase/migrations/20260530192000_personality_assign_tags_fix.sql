-- assign_personality_profession_tags had an ambiguous tag_id (OUT param vs the
-- column in the usage_count recompute) that aborted the call. Rename OUT params
-- to out_* and qualify the recompute subquery.
DROP FUNCTION IF EXISTS public.assign_personality_profession_tags(INT, BOOLEAN);
CREATE FUNCTION public.assign_personality_profession_tags(
  p_limit   INT DEFAULT 500,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE(out_personality_id UUID, out_tag_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.id AS pid, m.tag_id AS tid
    FROM public.personalities p
    JOIN public.personality_profession_tags m
      ON p.profession IS NOT NULL AND p.profession ILIKE '%' || m.profession_kw || '%'
    WHERE p.duplicate_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.unified_tag_assignments a
        WHERE a.entity_type='personality' AND a.entity_id=p.id AND a.tag_id=m.tag_id
      )
    LIMIT p_limit
  LOOP
    IF NOT p_dry_run THEN
      INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
      VALUES (r.tid, r.pid, 'personality')
      ON CONFLICT DO NOTHING;
    END IF;
    out_personality_id := r.pid; out_tag_id := r.tid; RETURN NEXT;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE public.unified_tags t
    SET usage_count = sub.cnt
    FROM (
      SELECT a.tag_id AS tid, count(*) AS cnt
      FROM public.unified_tag_assignments a GROUP BY a.tag_id
    ) sub
    WHERE sub.tid = t.id AND t.usage_count IS DISTINCT FROM sub.cnt;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_personality_profession_tags(INT, BOOLEAN) TO service_role;
COMMENT ON FUNCTION public.assign_personality_profession_tags IS
  'Deterministic profession->tag assignment via category-whitelisted personality_profession_tags map. OUT params prefixed out_ to avoid column collisions. Never assigns sensitive/NSFW tags. p_dry_run previews.';
