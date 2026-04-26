-- Multi-source conflict resolver: helper function + audit table.
-- Used by commit_*_staging_item RPCs to merge field values from multiple
-- sources via weighted voting instead of naive COALESCE/longest-wins.
--
-- Step 4a (this migration): adds the helper + audit table.
-- Step 4b (follow-up PR):    refactors commit_venue_staging_item to use it,
--                            keyed off venue_sources entries.
-- Decoupling ships infra without touching the production commit path until
-- the helper is exercised by tests.

-- ─── Audit table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.venue_field_conflicts (
  id              BIGSERIAL PRIMARY KEY,
  venue_id        UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  field_name      TEXT NOT NULL,
  resolved_value  JSONB,
  resolved_source TEXT,
  variants        JSONB NOT NULL,  -- array of {value, source, weight, score}
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_field_conflicts_venue
  ON public.venue_field_conflicts(venue_id, resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_field_conflicts_field
  ON public.venue_field_conflicts(field_name, resolved_at DESC);

ALTER TABLE public.venue_field_conflicts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venue_field_conflicts' AND policyname='vfc_admin_all') THEN
    CREATE POLICY "vfc_admin_all" ON public.venue_field_conflicts FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
END $$;
GRANT SELECT, INSERT ON public.venue_field_conflicts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.venue_field_conflicts_id_seq TO service_role;

-- ─── Resolver function ────────────────────────────────────────────
-- Inputs:
--   p_variants  jsonb array of {value, source, recency} entries
--   p_entity_type text   used to look up source_reliability.weight
-- Output: jsonb {resolved_value, resolved_source, scored_variants}
--
-- Scoring per variant:
--   weight   := coalesce(source_reliability.weight, 0.5)  -- neutral if unknown
--   length   := length(value::text)/200.0  capped at 1.0  -- richer values
--   recency  := exp(-age_days / 30.0)                     -- newer wins on ties
--   score    := weight * (0.5 + 0.3*length + 0.2*recency)
-- Highest score wins. NULL/empty values get score 0.
CREATE OR REPLACE FUNCTION public.resolve_field_conflict(
  p_variants    jsonb,
  p_entity_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_scored jsonb;
  v_best   jsonb;
BEGIN
  IF p_variants IS NULL OR jsonb_array_length(p_variants) = 0 THEN
    RETURN jsonb_build_object('resolved_value', NULL, 'resolved_source', NULL, 'scored_variants', '[]'::jsonb);
  END IF;

  WITH variants AS (
    SELECT
      v->>'source'                                         AS source,
      v->'value'                                           AS value,
      coalesce((v->>'recency_days')::numeric, 0)           AS recency_days
    FROM jsonb_array_elements(p_variants) v
  ),
  weighted AS (
    SELECT
      v.source,
      v.value,
      v.recency_days,
      coalesce(sr.weight, 0.5) AS weight,
      LEAST(1.0, length(coalesce(v.value::text,'')) / 200.0) AS len_norm,
      exp(-v.recency_days / 30.0) AS recency_norm
    FROM variants v
    LEFT JOIN public.source_reliability sr
      ON sr.source_slug = v.source AND sr.entity_type = p_entity_type
  ),
  scored AS (
    SELECT
      source, value, weight, len_norm, recency_norm,
      CASE
        WHEN value IS NULL OR value = 'null'::jsonb OR value::text IN ('""','""""') THEN 0
        ELSE weight * (0.5 + 0.3 * len_norm + 0.2 * recency_norm)
      END AS score
    FROM weighted
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'source', source, 'value', value,
      'weight', round(weight::numeric, 3),
      'score',  round(score::numeric, 3)
    ) ORDER BY score DESC
  ) INTO v_scored
  FROM scored;

  -- Pick highest scoring non-zero variant
  SELECT jsonb_build_object(
    'resolved_value',  variant->'value',
    'resolved_source', variant->>'source',
    'scored_variants', v_scored
  )
  INTO v_best
  FROM jsonb_array_elements(v_scored) variant
  WHERE (variant->>'score')::numeric > 0
  ORDER BY (variant->>'score')::numeric DESC
  LIMIT 1;

  RETURN coalesce(
    v_best,
    jsonb_build_object('resolved_value', NULL, 'resolved_source', NULL, 'scored_variants', v_scored)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_field_conflict(jsonb, text) TO service_role, authenticated;

COMMENT ON FUNCTION public.resolve_field_conflict(jsonb, text) IS
  'Multi-source field conflict resolver. Returns highest-scoring variant via source_reliability.weight × length × recency. Step 4a — wiring into commit_venue_staging_item is a follow-up.';
