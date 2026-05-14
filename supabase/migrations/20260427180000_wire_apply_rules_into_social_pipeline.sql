-- Wire pipeline-apply-rules into the social-media-ingestion DAG.
-- Runs AFTER safety/relevance so rules can fire on the same text
-- that's been OCR-ed and transcribed, and on any priority bumps
-- safety has already applied. Inserted between safety and src-social.

INSERT INTO public.pipeline_node_types (slug, category, display_name, description, edge_function, config_schema)
VALUES (
  'pipeline-apply-rules',
  'processor',
  'Apply Rules',
  'Evaluates active ingestion_rules against submission text (raw + ocr + vision + transcript). Applies labels, priority, status, permission, force_review patches; writes hit audit rows.',
  'pipeline-apply-rules',
  '{"type":"object","properties":{}}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  category      = EXCLUDED.category,
  display_name  = EXCLUDED.display_name,
  description   = EXCLUDED.description,
  edge_function = EXCLUDED.edge_function,
  config_schema = EXCLUDED.config_schema,
  updated_at    = now();

-- Patch the social-media-ingestion DAG: insert an apply-rules node and
-- redirect the safety→src-social edge through it.
UPDATE public.pipeline_definitions
SET
  nodes = (
    SELECT jsonb_agg(node)
    FROM (
      SELECT * FROM jsonb_array_elements(nodes) AS t(node)
      UNION ALL
      SELECT '{"id":"rules","type":"pipeline-apply-rules","position":{"x":400,"y":200},"data":{"label":"Apply rules","config":{}}}'::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(nodes) n
        WHERE n->>'id' = 'rules'
      )
    ) AS combined
  ),
  edges = (
    SELECT jsonb_agg(edge)
    FROM (
      SELECT
        CASE
          WHEN edge->>'source' = 'safety' AND edge->>'target' = 'src-social'
            THEN jsonb_set(edge, '{target}', '"rules"')
          ELSE edge
        END AS edge
      FROM jsonb_array_elements(edges) AS t(edge)
      UNION ALL
      SELECT '{"id":"e2b","source":"rules","target":"src-social"}'::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(edges) e
        WHERE e->>'source' = 'rules' AND e->>'target' = 'src-social'
      )
    ) AS combined
  ),
  updated_at = now()
WHERE name = 'social-media-ingestion';
