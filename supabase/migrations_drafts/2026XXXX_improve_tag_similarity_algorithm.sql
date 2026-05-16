-- P2-7: Improve tag similarity algorithm
-- DRAFT — requires human review before applying.
--
-- Changes:
-- 1. Within-category bonus: +0.15 score boost when both tags share a category
-- 2. Cross-adult penalty: reduce score by 0.3 when one tag is adult and the other isn't
-- 3. Raise co-occurrence minimum from 3 to 5 for tighter signal
-- 4. Add relationship_excluded table for manual admin overrides

-- Manual exclusion table for admin-curated relationship blocks
CREATE TABLE IF NOT EXISTS public.tag_relationship_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag1_id uuid NOT NULL REFERENCES public.unified_tags(id) ON DELETE CASCADE,
  tag2_id uuid NOT NULL REFERENCES public.unified_tags(id) ON DELETE CASCADE,
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag1_id, tag2_id),
  CHECK (tag1_id < tag2_id)
);

ALTER TABLE public.tag_relationship_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage exclusions" ON public.tag_relationship_exclusions
  USING (public.has_role_jwt('admin'::public.app_role));

-- Improved compute function
CREATE OR REPLACE FUNCTION public.compute_tag_similarities() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    SET statement_timeout TO '600s'
AS $$
DECLARE
  embedding_count INT := 0;
  cooccurrence_count INT := 0;
  total_count INT;
  batch_count INT;
  tag_ids uuid[];
  batch_start INT;
  batch_size INT := 200;
  num_tags INT;
BEGIN
  IF NOT has_role_jwt('admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  TRUNCATE tag_relationships;

  SELECT array_agg(content_id ORDER BY content_id) INTO tag_ids
  FROM content_embeddings WHERE content_type = 'tag';

  num_tags := coalesce(array_length(tag_ids, 1), 0);
  IF num_tags = 0 THEN
    RETURN json_build_object(
      'success', true,
      'embedding_relationships', 0,
      'cooccurrence_relationships', 0,
      'total_relationships', 0
    );
  END IF;

  -- Embedding-based relationships with within-category bonus
  batch_start := 1;
  WHILE batch_start <= num_tags LOOP
    INSERT INTO tag_relationships (id, tag1_id, tag2_id, similarity_score, relationship_type)
    SELECT
      gen_random_uuid(),
      e1.content_id,
      e2.content_id,
      ROUND(LEAST(
        (1 - (e1.embedding <=> e2.embedding))
        -- Within-category bonus: +0.15 if tags share a category
        + CASE WHEN EXISTS (
            SELECT 1 FROM tag_category_assignments tca1
            JOIN tag_category_assignments tca2
              ON tca1.category_id = tca2.category_id
            WHERE tca1.tag_id = e1.content_id
              AND tca2.tag_id = e2.content_id
          ) THEN 0.15 ELSE 0.0 END
        -- Cross-adult penalty: -0.3 when one is adult and other isn't
        - CASE WHEN (
            EXISTS (
              SELECT 1 FROM tag_category_assignments tca
              JOIN tag_categories tc ON tc.id = tca.category_id
              WHERE tca.tag_id = e1.content_id
                AND tc.name IN ('Sexuality & Kink','Sexual Roles','BDSM & Power Exchange',
                  'Fetishes & Interests','Practices & Play','Gear & Aesthetics','Body Types & Archetypes')
            )
          ) != (
            EXISTS (
              SELECT 1 FROM tag_category_assignments tca
              JOIN tag_categories tc ON tc.id = tca.category_id
              WHERE tca.tag_id = e2.content_id
                AND tc.name IN ('Sexuality & Kink','Sexual Roles','BDSM & Power Exchange',
                  'Fetishes & Interests','Practices & Play','Gear & Aesthetics','Body Types & Archetypes')
            )
          ) THEN 0.3 ELSE 0.0 END,
        1.0  -- cap at 1.0
      )::numeric, 4),
      'embedding'
    FROM content_embeddings e1
    JOIN content_embeddings e2
      ON e1.content_id < e2.content_id AND e2.content_type = 'tag'
    WHERE e1.content_type = 'tag'
      AND e1.content_id = ANY(tag_ids[batch_start : LEAST(batch_start + batch_size - 1, num_tags)])
      AND 1 - (e1.embedding <=> e2.embedding) >= 0.65  -- lower raw threshold since bonus can push up
      -- Exclude admin-blocked pairs
      AND NOT EXISTS (
        SELECT 1 FROM tag_relationship_exclusions tre
        WHERE tre.tag1_id = LEAST(e1.content_id, e2.content_id)
          AND tre.tag2_id = GREATEST(e1.content_id, e2.content_id)
      );

    GET DIAGNOSTICS batch_count = ROW_COUNT;
    embedding_count := embedding_count + batch_count;
    batch_start := batch_start + batch_size;
  END LOOP;

  -- Co-occurrence relationships (tighter: min 5 co-occurrences instead of 3)
  WITH venue_tag_ids AS (
    SELECT v.id AS venue_id, ut.id AS tag_id
    FROM venues v
    CROSS JOIN LATERAL unnest(v.tags) AS tag_name
    JOIN unified_tags ut ON lower(ut.name) = lower(tag_name)
    WHERE v.tags IS NOT NULL
  ),
  tag_venue_counts AS (
    SELECT tag_id, COUNT(DISTINCT venue_id) AS venue_count
    FROM venue_tag_ids GROUP BY tag_id
  ),
  co_pairs AS (
    SELECT
      LEAST(a.tag_id, b.tag_id) AS tag1_id,
      GREATEST(a.tag_id, b.tag_id) AS tag2_id,
      COUNT(DISTINCT a.venue_id) AS co_count
    FROM venue_tag_ids a
    JOIN venue_tag_ids b ON a.venue_id = b.venue_id AND a.tag_id < b.tag_id
    GROUP BY 1, 2
  ),
  scored AS (
    SELECT cp.tag1_id, cp.tag2_id,
      ROUND(
        (cp.co_count::numeric / GREATEST(tc1.venue_count + tc2.venue_count - cp.co_count, 1))::numeric,
        4
      ) AS score
    FROM co_pairs cp
    JOIN tag_venue_counts tc1 ON tc1.tag_id = cp.tag1_id
    JOIN tag_venue_counts tc2 ON tc2.tag_id = cp.tag2_id
    WHERE cp.co_count >= 5  -- tighter than before (was 3)
  )
  INSERT INTO tag_relationships (id, tag1_id, tag2_id, similarity_score, relationship_type)
  SELECT gen_random_uuid(), s.tag1_id, s.tag2_id, s.score, 'co_occurrence'
  FROM scored s
  WHERE s.score >= 0.15
    AND NOT EXISTS (
      SELECT 1 FROM tag_relationships tr
      WHERE tr.tag1_id = s.tag1_id AND tr.tag2_id = s.tag2_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM tag_relationship_exclusions tre
      WHERE tre.tag1_id = s.tag1_id AND tre.tag2_id = s.tag2_id
    );

  GET DIAGNOSTICS cooccurrence_count = ROW_COUNT;
  SELECT COUNT(*) INTO total_count FROM tag_relationships;

  RETURN json_build_object(
    'success', true,
    'embedding_relationships', embedding_count,
    'cooccurrence_relationships', cooccurrence_count,
    'total_relationships', total_count,
    'tags_processed', num_tags
  );
END;
$$;

-- Updated get_similar_tags: filter out excluded pairs
CREATE OR REPLACE FUNCTION public.get_similar_tags(
  p_tag_id uuid,
  p_limit integer DEFAULT 10,
  p_min_score double precision DEFAULT 0.7
) RETURNS TABLE(
  tag_id uuid, tag_name text, tag_slug text,
  category_name text, category_color text,
  similarity_score double precision, relationship_type text,
  usage_count integer
)
LANGUAGE plpgsql SET search_path TO 'public'
AS $$
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
      -- Exclude admin-blocked pairs
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
$$;

COMMENT ON TABLE public.tag_relationship_exclusions IS 'Admin-managed exclusions for tag similarity pairs that produce inappropriate cross-category matches.';
