-- ============================================================================
-- Content-processing simplification P0.2 — remove the dead ingestion-rules engine
-- ----------------------------------------------------------------------------
-- ingestion_rules has 0 rows and ingestion_rule_hits 0 rows since creation
-- (20260427095957): the rules engine was never used. It is one of THREE
-- parallel rule stores (ingestion_rules / automation_rules /
-- automated_review_rules) — this removes the dead one end-to-end:
--   * un-wires the 'rules' node from the social-media-ingestion DAG
--     (inverse of 20260427180000_wire_apply_rules_into_social_pipeline)
--   * drops the pipeline-apply-rules node type
--   * drops both tables
-- The pipeline-apply-rules edge fn + _shared/ingestion-rules.ts are deleted
-- from the repo in the same PR; the deployed fn is removed via
-- `supabase functions delete pipeline-apply-rules`.
-- The /admin/ingestion-rules page is deleted; its URL-import box moves to
-- /admin/imports/data.
-- ============================================================================

-- 1. Un-wire the DAG: safety→rules→src-social becomes safety→src-social again.
UPDATE public.pipeline_definitions
SET
  nodes = (
    SELECT COALESCE(jsonb_agg(node), '[]'::jsonb)
    FROM jsonb_array_elements(nodes) AS t(node)
    WHERE node->>'id' <> 'rules'
  ),
  edges = (
    SELECT COALESCE(jsonb_agg(edge), '[]'::jsonb)
    FROM (
      SELECT
        CASE
          WHEN edge->>'source' = 'safety' AND edge->>'target' = 'rules'
            THEN jsonb_set(edge, '{target}', '"src-social"')
          ELSE edge
        END AS edge
      FROM jsonb_array_elements(edges) AS t(edge)
      WHERE NOT (edge->>'source' = 'rules')
    ) AS rewired
  ),
  updated_at = now()
WHERE name = 'social-media-ingestion'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(nodes) n WHERE n->>'id' = 'rules'
  );

-- 2. Drop the node type so the builder no longer offers it.
DELETE FROM public.pipeline_node_types WHERE slug = 'pipeline-apply-rules';

-- 3. Drop the dead tables (hits first: FK to rules).
DROP TABLE IF EXISTS public.ingestion_rule_hits;
DROP TABLE IF EXISTS public.ingestion_rules;
