-- ============================================================================
-- Personality pipeline — complete the remaining gaps
-- 1. Register source-personality-staging + pipeline-enrich-personality node types
-- 2. Expand DAG to 8 nodes (source → normalize → enrich → validate → dedup →
--    quality → review → commit) with proper React-Flow shape
-- 3. Seed workflow_definitions cron driver (*/10 * * * * via workflow-dispatcher)
-- 4. Fix personality_sources unique index so ON CONFLICT resolves
-- ============================================================================

-- 1. Node types
INSERT INTO public.pipeline_node_types
  (slug, category, display_name, description, icon, color, edge_function,
   config_schema, input_ports, output_ports, is_enabled)
VALUES
  ('source-personality-staging', 'source', 'Personality Staging Queue',
   'Entry point: CSV upload, bulk Wikidata, admin form — all feed ingestion_staging',
   'inbox', '#64748b', NULL,
   jsonb_build_object(),
   jsonb_build_array(),
   jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
   true),
  ('pipeline-enrich-personality', 'enricher', 'Personality Enricher',
   'Wikidata QID lookup + claim extraction (dates, image, external IDs) + image HEAD check',
   'sparkles', '#a855f7', 'pipeline-enrich-personality',
   jsonb_build_object(
     'fetch_wikidata', jsonb_build_object('type','boolean','default',true),
     'fetch_image',    jsonb_build_object('type','boolean','default',true),
     'fetch_sanctions',jsonb_build_object('type','boolean','default',false)
   ),
   jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
   jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
   true)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  icon  = EXCLUDED.icon,
  color = EXCLUDED.color,
  edge_function = EXCLUDED.edge_function,
  is_enabled = true,
  updated_at = now();

-- 2. Expanded DAG
WITH d AS (
  SELECT slug, icon, color FROM public.pipeline_node_types
  WHERE slug IN ('source-personality-staging','pipeline-enrich-personality',
                 'pipeline-normalize','pipeline-validate','pipeline-deduplicate',
                 'pipeline-quality-score','pipeline-review-gate','pipeline-commit')
)
UPDATE public.pipeline_definitions SET
  nodes = jsonb_build_array(
    jsonb_build_object('id','source','type','baseNode',
      'position', jsonb_build_object('x',  40, 'y', 160),
      'data', jsonb_build_object(
        'label','Staging Queue',
        'icon',(SELECT icon FROM d WHERE slug='source-personality-staging'),
        'color',(SELECT color FROM d WHERE slug='source-personality-staging'),
        'category','source','nodeTypeSlug','source-personality-staging',
        'inputPorts', jsonb_build_array(),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality'))),
    jsonb_build_object('id','normalize','type','baseNode',
      'position', jsonb_build_object('x', 260, 'y', 160),
      'data', jsonb_build_object('label','Normalize',
        'icon',(SELECT icon FROM d WHERE slug='pipeline-normalize'),
        'color',(SELECT color FROM d WHERE slug='pipeline-normalize'),
        'category','processor','nodeTypeSlug','pipeline-normalize',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality'))),
    jsonb_build_object('id','enrich','type','baseNode',
      'position', jsonb_build_object('x', 480, 'y', 160),
      'data', jsonb_build_object('label','Enrich',
        'icon',(SELECT icon FROM d WHERE slug='pipeline-enrich-personality'),
        'color',(SELECT color FROM d WHERE slug='pipeline-enrich-personality'),
        'category','enricher','nodeTypeSlug','pipeline-enrich-personality',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('fetch_wikidata',true,'fetch_image',true,'fetch_sanctions',false))),
    jsonb_build_object('id','validate','type','baseNode',
      'position', jsonb_build_object('x', 700, 'y', 160),
      'data', jsonb_build_object('label','Validate',
        'icon',(SELECT icon FROM d WHERE slug='pipeline-validate'),
        'color',(SELECT color FROM d WHERE slug='pipeline-validate'),
        'category','validator','nodeTypeSlug','pipeline-validate',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality','reject_below_score',40))),
    jsonb_build_object('id','dedup','type','baseNode',
      'position', jsonb_build_object('x', 920, 'y', 160),
      'data', jsonb_build_object('label','Deduplicate',
        'icon',(SELECT icon FROM d WHERE slug='pipeline-deduplicate'),
        'color',(SELECT color FROM d WHERE slug='pipeline-deduplicate'),
        'category','processor','nodeTypeSlug','pipeline-deduplicate',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality','auto_merge_min',0.90,'review_min',0.75))),
    jsonb_build_object('id','quality','type','baseNode',
      'position', jsonb_build_object('x',1140, 'y', 160),
      'data', jsonb_build_object('label','Quality Score',
        'icon',(SELECT icon FROM d WHERE slug='pipeline-quality-score'),
        'color',(SELECT color FROM d WHERE slug='pipeline-quality-score'),
        'category','processor','nodeTypeSlug','pipeline-quality-score',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality'))),
    jsonb_build_object('id','review','type','baseNode',
      'position', jsonb_build_object('x',1360, 'y', 160),
      'data', jsonb_build_object('label','Review Gate',
        'icon',(SELECT icon FROM d WHERE slug='pipeline-review-gate'),
        'color',(SELECT color FROM d WHERE slug='pipeline-review-gate'),
        'category','control','nodeTypeSlug','pipeline-review-gate',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(jsonb_build_object('id','out','label','out','type','staging')),
        'config', jsonb_build_object('entity_type','personality','auto_approve_above',0.85))),
    jsonb_build_object('id','commit','type','baseNode',
      'position', jsonb_build_object('x',1580, 'y', 160),
      'data', jsonb_build_object('label','Commit',
        'icon',(SELECT icon FROM d WHERE slug='pipeline-commit'),
        'color',(SELECT color FROM d WHERE slug='pipeline-commit'),
        'category','output','nodeTypeSlug','pipeline-commit',
        'inputPorts',  jsonb_build_array(jsonb_build_object('id','in','label','in','type','staging')),
        'outputPorts', jsonb_build_array(),
        'config', jsonb_build_object('entity_type','personality','targetTable','personalities','use_rpc','commit_personality_staging_batch')))
  ),
  edges = jsonb_build_array(
    jsonb_build_object('id','e1','source','source',   'sourceHandle','out','target','normalize','targetHandle','in','animated',true),
    jsonb_build_object('id','e2','source','normalize','sourceHandle','out','target','enrich',   'targetHandle','in','animated',true),
    jsonb_build_object('id','e3','source','enrich',   'sourceHandle','out','target','validate', 'targetHandle','in','animated',true),
    jsonb_build_object('id','e4','source','validate', 'sourceHandle','out','target','dedup',    'targetHandle','in','animated',true),
    jsonb_build_object('id','e5','source','dedup',    'sourceHandle','out','target','quality',  'targetHandle','in','animated',true),
    jsonb_build_object('id','e6','source','quality',  'sourceHandle','out','target','review',   'targetHandle','in','animated',true),
    jsonb_build_object('id','e7','source','review',   'sourceHandle','out','target','commit',   'targetHandle','in','animated',true)
  ),
  schedule = '*/10 * * * *',
  updated_at = now()
WHERE name = 'personality-ingestion';

-- 3. Cron driver
INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name,
   default_payload, schedule, max_retries, retry_backoff_base,
   max_concurrency, timeout_seconds, is_enabled, priority, tags)
VALUES
  ('personality-pipeline',
   'Personality Pipeline (cron)',
   'Drives personality-ingestion DAG every 10 min: staged rows -> normalize -> enrich -> validate -> dedup -> quality -> review -> commit',
   'workflow-dispatcher', 'scheduled_jobs',
   jsonb_build_object('pipeline_name','personality-ingestion','automated',true),
   '*/10 * * * *',
   3, 60, 2, 600, true, 4,
   ARRAY['cron','import','personality','pipeline'])
ON CONFLICT (name) DO UPDATE
  SET display_name    = EXCLUDED.display_name,
      description     = EXCLUDED.description,
      schedule        = EXCLUDED.schedule,
      default_payload = EXCLUDED.default_payload,
      is_enabled      = true,
      tags            = EXCLUDED.tags,
      updated_at      = now();

-- 4. Fix personality_sources unique index (remove WHERE clause so ON CONFLICT
--    inference works — blocked Harvey Milk smoke-test commit otherwise)
DROP INDEX IF EXISTS public.personality_sources_src_eid_uniq;
CREATE UNIQUE INDEX personality_sources_src_eid_uniq
  ON public.personality_sources (source_slug, source_entity_id);
