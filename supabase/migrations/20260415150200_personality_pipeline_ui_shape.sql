-- ============================================================================
-- Personality pipeline UI shape
-- - Register missing pipeline-quality-score node type
-- - Backfill icon/color on all 6 pipeline-* node types so palette + canvas render
-- - Reshape personality-ingestion nodes to React-Flow format (baseNode + position
--   + data{label,icon,color,category,nodeTypeSlug,config,inputPorts,outputPorts})
--   so the DAG is fully visible, editable and observable at
--   https://queer.guide/admin/pipelines?pipeline=personality-ingestion
-- ============================================================================

-- 1. Ensure the quality-score node type exists
INSERT INTO public.pipeline_node_types
  (slug, category, display_name, description, icon, color, edge_function,
   config_schema, input_ports, output_ports, is_enabled)
VALUES
  ('pipeline-quality-score', 'processor', 'Quality Score',
   'Computes a 0-100 data-completeness score; writes to enriched_data.quality_score',
   'gauge', '#f59e0b', 'pipeline-quality-score',
   jsonb_build_object('entity_type', jsonb_build_object('type','string','default','')),
   jsonb_build_array(jsonb_build_object('id','in','type','staging')),
   jsonb_build_array(jsonb_build_object('id','out','type','staging')),
   true)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  icon = COALESCE(public.pipeline_node_types.icon, EXCLUDED.icon),
  color = COALESCE(public.pipeline_node_types.color, EXCLUDED.color),
  is_enabled = true,
  updated_at = now();

-- 2. Backfill icon + color on pipeline-* node types missing them
UPDATE public.pipeline_node_types SET
  icon  = COALESCE(icon,  CASE slug
            WHEN 'pipeline-normalize'      THEN 'wand-2'
            WHEN 'pipeline-validate'       THEN 'shield-check'
            WHEN 'pipeline-deduplicate'    THEN 'copy'
            WHEN 'pipeline-quality-score'  THEN 'gauge'
            WHEN 'pipeline-review-gate'    THEN 'shield-alert'
            WHEN 'pipeline-commit'         THEN 'database'
            ELSE 'box'
          END),
  color = COALESCE(color, CASE slug
            WHEN 'pipeline-normalize'      THEN '#6366f1'
            WHEN 'pipeline-validate'       THEN '#10b981'
            WHEN 'pipeline-deduplicate'    THEN '#0ea5e9'
            WHEN 'pipeline-quality-score'  THEN '#f59e0b'
            WHEN 'pipeline-review-gate'    THEN '#ef4444'
            WHEN 'pipeline-commit'         THEN '#8b5cf6'
            ELSE '#6b7280'
          END),
  updated_at = now()
WHERE icon IS NULL OR color IS NULL;

-- 3. Reshape personality-ingestion nodes to React-Flow format
WITH defs AS (
  SELECT slug, display_name, icon, color, category, edge_function
  FROM public.pipeline_node_types
  WHERE slug IN ('pipeline-normalize','pipeline-validate','pipeline-deduplicate',
                 'pipeline-quality-score','pipeline-review-gate','pipeline-commit')
)
UPDATE public.pipeline_definitions SET
  nodes = jsonb_build_array(
    jsonb_build_object(
      'id','normalize','type','baseNode',
      'position', jsonb_build_object('x', 40,  'y', 160),
      'data', jsonb_build_object(
        'label','Normalize','icon',(SELECT icon FROM defs WHERE slug='pipeline-normalize'),
        'color',(SELECT color FROM defs WHERE slug='pipeline-normalize'),
        'category','processor','nodeTypeSlug','pipeline-normalize',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality'))
    ),
    jsonb_build_object(
      'id','validate','type','baseNode',
      'position', jsonb_build_object('x', 280, 'y', 160),
      'data', jsonb_build_object(
        'label','Validate','icon',(SELECT icon FROM defs WHERE slug='pipeline-validate'),
        'color',(SELECT color FROM defs WHERE slug='pipeline-validate'),
        'category','validator','nodeTypeSlug','pipeline-validate',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality','reject_below_score',40))
    ),
    jsonb_build_object(
      'id','dedup','type','baseNode',
      'position', jsonb_build_object('x', 520, 'y', 160),
      'data', jsonb_build_object(
        'label','Deduplicate','icon',(SELECT icon FROM defs WHERE slug='pipeline-deduplicate'),
        'color',(SELECT color FROM defs WHERE slug='pipeline-deduplicate'),
        'category','processor','nodeTypeSlug','pipeline-deduplicate',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality','auto_merge_min',0.90,'review_min',0.75))
    ),
    jsonb_build_object(
      'id','quality','type','baseNode',
      'position', jsonb_build_object('x', 760, 'y', 160),
      'data', jsonb_build_object(
        'label','Quality Score','icon',(SELECT icon FROM defs WHERE slug='pipeline-quality-score'),
        'color',(SELECT color FROM defs WHERE slug='pipeline-quality-score'),
        'category','processor','nodeTypeSlug','pipeline-quality-score',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality'))
    ),
    jsonb_build_object(
      'id','review','type','baseNode',
      'position', jsonb_build_object('x',1000, 'y', 160),
      'data', jsonb_build_object(
        'label','Review Gate','icon',(SELECT icon FROM defs WHERE slug='pipeline-review-gate'),
        'color',(SELECT color FROM defs WHERE slug='pipeline-review-gate'),
        'category','control','nodeTypeSlug','pipeline-review-gate',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality','auto_approve_above',0.85))
    ),
    jsonb_build_object(
      'id','commit','type','baseNode',
      'position', jsonb_build_object('x',1240, 'y', 160),
      'data', jsonb_build_object(
        'label','Commit','icon',(SELECT icon FROM defs WHERE slug='pipeline-commit'),
        'color',(SELECT color FROM defs WHERE slug='pipeline-commit'),
        'category','output','nodeTypeSlug','pipeline-commit',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality','targetTable','personalities','use_rpc','commit_personality_staging_batch'))
    )
  ),
  edges = jsonb_build_array(
    jsonb_build_object('id','e-normalize-validate','source','normalize','sourceHandle','out','target','validate','targetHandle','in','animated',true),
    jsonb_build_object('id','e-validate-dedup',    'source','validate','sourceHandle','out','target','dedup',   'targetHandle','in','animated',true),
    jsonb_build_object('id','e-dedup-quality',     'source','dedup',   'sourceHandle','out','target','quality', 'targetHandle','in','animated',true),
    jsonb_build_object('id','e-quality-review',    'source','quality', 'sourceHandle','out','target','review',  'targetHandle','in','animated',true),
    jsonb_build_object('id','e-review-commit',     'source','review',  'sourceHandle','out','target','commit',  'targetHandle','in','animated',true)
  ),
  updated_at = now()
WHERE name = 'personality-ingestion';
