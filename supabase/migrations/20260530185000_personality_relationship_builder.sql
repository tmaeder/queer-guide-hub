-- Build auto relationships from co-membership signals (SQL-only, cheap):
--   shared_city: two personalities with the same city_id
--   shared_tag : two personalities sharing a unified_tag assignment
-- Edges stored with the smaller id as source to dedupe.

CREATE OR REPLACE FUNCTION public.build_personality_relationships(
  p_limit   INT DEFAULT 5000,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE(source_id UUID, target_id UUID, relationship_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH city_pairs AS (
    SELECT LEAST(a.id,b.id) AS s, GREATEST(a.id,b.id) AS t, 'shared_city'::text AS rt
    FROM public.personalities a
    JOIN public.personalities b
      ON a.city_id = b.city_id AND a.id < b.id
    WHERE a.city_id IS NOT NULL AND a.duplicate_of_id IS NULL AND b.duplicate_of_id IS NULL
    LIMIT p_limit
  ),
  tag_pairs AS (
    SELECT LEAST(x.entity_id, y.entity_id) AS s, GREATEST(x.entity_id, y.entity_id) AS t, 'shared_tag'::text AS rt
    FROM public.unified_tag_assignments x
    JOIN public.unified_tag_assignments y
      ON x.tag_id = y.tag_id AND x.entity_id < y.entity_id
    WHERE x.entity_type='personality' AND y.entity_type='personality'
    LIMIT p_limit
  ),
  all_pairs AS (
    SELECT * FROM city_pairs UNION ALL SELECT * FROM tag_pairs
  ),
  ins AS (
    INSERT INTO public.personality_relationships
      (source_personality_id, target_type, target_personality_id, relationship_type, source, weight)
    SELECT s, 'personality', t, rt, 'auto', 1.0 FROM all_pairs
    WHERE NOT p_dry_run
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT s, t, rt FROM all_pairs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_personality_relationships(INT, BOOLEAN) TO service_role;
COMMENT ON FUNCTION public.build_personality_relationships IS
  'Auto-build personality<->personality edges from shared_city + shared_tag co-membership. p_dry_run previews. Idempotent via partial unique index.';

-- Graph RPC for the force-graph UI: neighbourhood around one personality.
CREATE OR REPLACE FUNCTION public.get_personality_graph_data(
  p_personality_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH edges AS (
    SELECT r.source_personality_id AS s, r.target_personality_id AS t,
           r.relationship_type AS rt, r.weight
    FROM public.personality_relationships r
    WHERE r.target_type='personality'
      AND (r.source_personality_id = p_personality_id OR r.target_personality_id = p_personality_id)
    ORDER BY r.weight DESC
    LIMIT p_limit
  ),
  node_ids AS (
    SELECT p_personality_id AS id
    UNION SELECT s FROM edges UNION SELECT t FROM edges
  )
  SELECT jsonb_build_object(
    'nodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'image_url', p.image_url,
        'profession', p.profession))
      FROM public.personalities p JOIN node_ids n ON n.id = p.id), '[]'::jsonb),
    'edges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('source', s, 'target', t, 'type', rt, 'weight', weight))
      FROM edges), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_personality_graph_data(UUID, INT) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_personality_graph_data IS
  'Returns {nodes,edges} JSON for the react-force-graph around a personality. Public-readable.';
