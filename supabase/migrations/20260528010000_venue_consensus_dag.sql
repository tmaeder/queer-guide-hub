-- =============================================================================
-- Venue Truth Engine — Phase 2: wire consensus-merge into the live venue DAG
-- =============================================================================
-- venue-ingestion-unified already runs daily (cron pipeline-venue-ingestion,
-- 0 3 * * *) over 7 sources. This inserts the consensus-merge node between
-- dedupe and quality so every run fuses multi-source candidates into a single
-- truth with per-field provenance + confidence. The existing cron makes it
-- continuous — no new schedule needed. Surgical + idempotent: we splice the
-- live nodes/edges rather than overwrite them, preserving the current shape.
-- =============================================================================

-- 1. Register the node type so pipeline-executor can resolve the slug.
INSERT INTO public.pipeline_node_types (slug, display_name, edge_function, category, description, icon, color) VALUES
  ('pipeline-consensus-merge', 'Consensus Merge', 'pipeline-consensus-merge', 'processor',
   'Field-level multi-source consensus: votes each venue field across sources + current value, writes provenance + confidence, folds the winning truth into the committed record.',
   'GitMerge', '#0ea5e9')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name, edge_function = EXCLUDED.edge_function,
  category = EXCLUDED.category, description = EXCLUDED.description,
  icon = EXCLUDED.icon, color = EXCLUDED.color;

-- 2. Splice the consensus node + rewire dedupe → consensus → quality.
--    Guarded so re-running is a no-op (won't double-insert).
UPDATE public.pipeline_definitions
SET
  nodes = nodes || jsonb_build_array(jsonb_build_object(
    'id', 'consensus',
    'type', 'pipeline-consensus-merge',
    'position', jsonb_build_object('x', 1230, 'y', 310),
    'data', jsonb_build_object(
      'label', 'Consensus Merge',
      'icon', 'GitMerge',
      'color', '#0ea5e9',
      'category', 'processor',
      'description', 'Field-level multi-source consensus; writes provenance + confidence',
      'config', jsonb_build_object('batch_size', 100, 'auto_threshold', 0.85),
      'inputPorts', jsonb_build_array(jsonb_build_object('id','in','type','venue','label','in')),
      'outputPorts', jsonb_build_array(jsonb_build_object('id','out','type','venue','label','out')),
      'nodeTypeSlug', 'pipeline-consensus-merge'
    )
  )),
  edges = (
    SELECT jsonb_agg(e) FROM jsonb_array_elements(edges) e WHERE e->>'id' <> 'e-d-q'
  ) || jsonb_build_array(
    jsonb_build_object('id','e-d-cons','source','dedupe','target','consensus'),
    jsonb_build_object('id','e-cons-q','source','consensus','target','quality')
  ),
  updated_at = now()
WHERE name = 'venue-ingestion-unified'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(nodes) n WHERE n->>'id' = 'consensus'
  );
