-- Specificity-driven personality<->personality edge builder.
--
-- Problem with the prior builder: a flat global LIMIT p_limit over a self-join of
-- unified_tag_assignments. Broad profession tags blow up combinatorially — e.g. the
-- "Author" tag (~2,616 personalities) alone yields C(2616,2) ≈ 3.4M shared_tag pairs.
-- A flat LIMIT just takes whichever pairs the scan emits first, so the 60k edges built
-- were arbitrary and most popular-tag neighbourhoods were random noise.
--
-- Fix:
--   1. Drop broad tags: only tags used by <= p_tag_max personalities form shared_tag edges.
--   2. Weight by rarity: w = 1/ln(usage_count) — a shared niche tag is a stronger signal
--      than a shared profession. get_personality_graph_data() ORDER BY weight DESC then
--      surfaces the most meaningful ties first.
--   3. Bound degree: keep only each personality's strongest p_per_node ties, mutually
--      (an edge survives only if BOTH endpoints rank the other in their top-N) — this
--      guarantees shared_tag degree per node <= p_per_node, so the graph stays sparse and
--      edge count is driven by specificity, not an arbitrary ceiling.
-- shared_city is kept exactly as before (flat co-membership, weight 1.0, capped by p_limit).

DROP FUNCTION IF EXISTS public.build_personality_relationships(INT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.build_personality_relationships(
  p_limit    INT     DEFAULT 5000,   -- cap for the shared_city layer (kept as-is)
  p_dry_run  BOOLEAN DEFAULT false,  -- preview only, no writes
  p_tag_max  INT     DEFAULT 200,    -- skip profession-scale tags: a tag forms shared_tag edges only if used by <= this many personalities
  p_per_node INT     DEFAULT 60      -- max shared_tag edges kept per personality (mutual top-N, strongest by tag rarity)
)
RETURNS TABLE(source_id UUID, target_id UUID, relationship_type TEXT, weight NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- shared_city: unchanged co-membership, flat cap.
  CREATE TEMP TABLE _city_pairs ON COMMIT DROP AS
    SELECT LEAST(a.id,b.id) AS s, GREATEST(a.id,b.id) AS t,
           'shared_city'::text AS rt, 1.0::numeric AS w
    FROM public.personalities a
    JOIN public.personalities b
      ON a.city_id = b.city_id AND a.id < b.id
    WHERE a.city_id IS NOT NULL
      AND a.duplicate_of_id IS NULL AND b.duplicate_of_id IS NULL
    LIMIT p_limit;

  -- shared_tag: specificity-driven, per-tag pruned, degree-bounded.
  CREATE TEMP TABLE _tag_pairs ON COMMIT DROP AS
  WITH tag_usage AS (
    SELECT a.tag_id, COUNT(*)::int AS uc
    FROM public.unified_tag_assignments a
    WHERE a.entity_type = 'personality'
    GROUP BY a.tag_id
  ),
  eligible AS (   -- prune broad tags; rarer tag => higher weight
    SELECT tag_id, (1.0 / ln(GREATEST(uc::numeric, 2.0)))::numeric AS w
    FROM tag_usage
    WHERE uc BETWEEN 2 AND p_tag_max
  ),
  raw_pairs AS (
    SELECT LEAST(x.entity_id, y.entity_id)    AS s,
           GREATEST(x.entity_id, y.entity_id) AS t,
           e.w
    FROM public.unified_tag_assignments x
    JOIN public.unified_tag_assignments y
      ON x.tag_id = y.tag_id AND x.entity_id < y.entity_id
    JOIN eligible e ON e.tag_id = x.tag_id
    WHERE x.entity_type = 'personality' AND y.entity_type = 'personality'
  ),
  pair_best AS (  -- a pair may share several tags; the rarest (max weight) defines the edge
    SELECT s, t, MAX(w) AS w
    FROM raw_pairs
    GROUP BY s, t
  ),
  endpoint AS (   -- expand to both directions so each node can rank its own partners
    SELECT s AS pid, t AS partner, w FROM pair_best
    UNION ALL
    SELECT t AS pid, s AS partner, w FROM pair_best
  ),
  ranked AS (
    SELECT pid, partner,
           ROW_NUMBER() OVER (PARTITION BY pid ORDER BY w DESC, partner) AS rn
    FROM endpoint
  ),
  topn AS (       -- each node's strongest p_per_node partners
    SELECT pid, partner FROM ranked WHERE rn <= p_per_node
  )
  -- mutual top-N => guaranteed shared_tag degree per node <= p_per_node
  SELECT pb.s, pb.t, 'shared_tag'::text AS rt, pb.w
  FROM pair_best pb
  JOIN topn a ON a.pid = pb.s AND a.partner = pb.t
  JOIN topn b ON b.pid = pb.t AND b.partner = pb.s;

  IF NOT p_dry_run THEN
    -- rebuild the auto layer only; curated edges (source <> 'auto') untouched
    DELETE FROM public.personality_relationships pr
    WHERE pr.source = 'auto' AND pr.target_type = 'personality'
      AND pr.relationship_type IN ('shared_city','shared_tag');

    INSERT INTO public.personality_relationships
      (source_personality_id, target_type, target_personality_id, relationship_type, source, weight)
    SELECT z.s, 'personality', z.t, z.rt, 'auto', z.w
    FROM (SELECT s,t,rt,w FROM _city_pairs
          UNION ALL
          SELECT s,t,rt,w FROM _tag_pairs) z
    ON CONFLICT DO NOTHING;  -- idempotent via pr_uniq_personality
  END IF;

  RETURN QUERY
    SELECT s, t, rt, w FROM _city_pairs
    UNION ALL
    SELECT s, t, rt, w FROM _tag_pairs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_personality_relationships(INT, BOOLEAN, INT, INT) TO service_role;
COMMENT ON FUNCTION public.build_personality_relationships(INT, BOOLEAN, INT, INT) IS
  'Auto-build personality<->personality edges. shared_city: flat co-membership (cap p_limit, weight 1.0). '
  'shared_tag: specificity-driven — prune tags used by > p_tag_max personalities, weight = 1/ln(usage_count), '
  'keep each personality''s strongest p_per_node ties mutually (degree-bounded). Rebuilds the auto layer; '
  'curated edges preserved. p_dry_run previews. Idempotent via pr_uniq_personality.';
