-- get_tag_graph_data: cap edges at top-N strongest per node.
-- The old function had NO limit: at p_min_score=0.7 it returned ~69k edges /
-- ~3.8k nodes — a payload and client-simulation problem regardless of renderer.
-- The cap keeps an edge when it ranks in the top N by score for EITHER endpoint,
-- so weakly-connected nodes keep their best links and the graph stays connected,
-- instead of a blunt LIMIT that would drop whole regions.
-- Also emits 'category' (alias of category_name) — the frontend GraphNode reads
-- node.category, which the old payload never provided.

-- Drop the 2-arg version: keeping it alongside a 3-arg overload makes PostgREST
-- named-argument resolution ambiguous.
DROP FUNCTION IF EXISTS public.get_tag_graph_data(double precision, uuid);

CREATE FUNCTION public.get_tag_graph_data(
  "p_min_score" double precision DEFAULT 0.7,
  "p_category_filter" uuid DEFAULT NULL::uuid,
  "p_max_edges_per_node" integer DEFAULT 8
) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  WITH filtered AS (
    SELECT tr.tag1_id, tr.tag2_id, tr.similarity_score, tr.relationship_type
    FROM tag_relationships tr
    WHERE tr.similarity_score >= p_min_score
      AND (p_category_filter IS NULL OR (
        EXISTS (SELECT 1 FROM unified_tags WHERE id = tr.tag1_id AND category_id = p_category_filter)
        AND EXISTS (SELECT 1 FROM unified_tags WHERE id = tr.tag2_id AND category_id = p_category_filter)
      ))
  ),
  ranked AS (
    SELECT f.*,
      row_number() OVER (PARTITION BY f.tag1_id ORDER BY f.similarity_score DESC) AS r1,
      row_number() OVER (PARTITION BY f.tag2_id ORDER BY f.similarity_score DESC) AS r2
    FROM filtered f
  ),
  capped AS (
    SELECT r.tag1_id, r.tag2_id, r.similarity_score, r.relationship_type
    FROM ranked r
    WHERE p_max_edges_per_node IS NULL
       OR r.r1 <= p_max_edges_per_node
       OR r.r2 <= p_max_edges_per_node
  )
  SELECT json_build_object(
    'nodes', COALESCE((
      SELECT json_agg(json_build_object(
        'id', ut.id,
        'name', ut.name,
        'slug', ut.slug,
        'category_id', ut.category_id,
        'category_name', tc.name,
        'category', tc.name,
        'category_color', tc.color,
        'usage_count', COALESCE(ut.usage_count, 0)
      ))
      FROM unified_tags ut
      LEFT JOIN tag_categories tc ON tc.id = ut.category_id
      WHERE ut.status = 'active'
        AND ut.id IN (
          SELECT tag1_id FROM capped
          UNION
          SELECT tag2_id FROM capped
        )
        AND (p_category_filter IS NULL OR ut.category_id = p_category_filter)
    ), '[]'::json),
    'edges', COALESCE((
      SELECT json_agg(json_build_object(
        'source', c.tag1_id,
        'target', c.tag2_id,
        'score', c.similarity_score,
        'type', c.relationship_type
      ))
      FROM capped c
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

ALTER FUNCTION public.get_tag_graph_data(double precision, uuid, integer) OWNER TO postgres;

-- Same grant posture as before (see 20260504030000 + security-lint revokes):
-- callable by anon/authenticated/service_role, not PUBLIC.
REVOKE ALL ON FUNCTION public.get_tag_graph_data(double precision, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tag_graph_data(double precision, uuid, integer) TO anon, authenticated, service_role;
