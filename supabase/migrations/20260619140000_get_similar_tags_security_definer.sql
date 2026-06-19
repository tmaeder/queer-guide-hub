-- get_similar_tags ran SECURITY INVOKER and reads tag_relationship_exclusions,
-- which has RLS enabled and no SELECT grant for anon/authenticated. Result:
-- signed-out (and most signed-in) visitors hit `permission denied for table
-- tag_relationship_exclusions` (42501), so the "Related" tags card on every
-- /resources/:tag glossary page silently rendered nothing for the public.
--
-- Fix: run it SECURITY DEFINER (the function already pins search_path), matching
-- its sibling get_tag_graph_data which is already DEFINER. The function is
-- read-only and parameterised; DEFINER only lets it bypass RLS on the
-- exclusions table to evaluate the NOT EXISTS filter.
CREATE OR REPLACE FUNCTION public.get_similar_tags(
  p_tag_id uuid,
  p_limit integer DEFAULT 10,
  p_min_score double precision DEFAULT 0.7
)
RETURNS TABLE(
  tag_id uuid, tag_name text, tag_slug text, category_name text,
  category_color text, similarity_score double precision,
  relationship_type text, usage_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH related AS (
    SELECT
      CASE WHEN tr.tag1_id = p_tag_id THEN tr.tag2_id ELSE tr.tag1_id END AS related_tag_id,
      tr.similarity_score::float,
      tr.relationship_type
    FROM tag_relationships tr
    WHERE (tr.tag1_id = p_tag_id OR tr.tag2_id = p_tag_id)
      AND tr.similarity_score >= p_min_score
      AND NOT EXISTS (
        SELECT 1 FROM tag_relationship_exclusions tre
        WHERE tre.tag1_id = LEAST(p_tag_id, CASE WHEN tr.tag1_id = p_tag_id THEN tr.tag2_id ELSE tr.tag1_id END)
          AND tre.tag2_id = GREATEST(p_tag_id, CASE WHEN tr.tag1_id = p_tag_id THEN tr.tag2_id ELSE tr.tag1_id END)
      )
    ORDER BY tr.similarity_score DESC
    LIMIT p_limit
  )
  SELECT
    ut.id, ut.name, ut.slug,
    tc.name, tc.color,
    r.similarity_score, r.relationship_type,
    COALESCE(ut.usage_count, 0)::int
  FROM related r
  JOIN unified_tags ut ON ut.id = r.related_tag_id
  LEFT JOIN tag_categories tc ON tc.id = ut.category_id
  WHERE ut.status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      ut.id, ut.name, ut.slug,
      tc.name, tc.color,
      0.0::float AS similarity_score,
      'same_category'::text AS relationship_type,
      COALESCE(ut.usage_count, 0)::int
    FROM unified_tags ut
    LEFT JOIN tag_categories tc ON tc.id = ut.category_id
    WHERE ut.category_id = (SELECT category_id FROM unified_tags WHERE id = p_tag_id)
      AND ut.id != p_tag_id
      AND ut.status = 'active'
    ORDER BY ut.usage_count DESC NULLS LAST
    LIMIT p_limit;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_similar_tags(uuid, integer, double precision) TO anon, authenticated;
