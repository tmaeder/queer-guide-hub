-- Marketplace ingestion: a single merchant-source failure (e.g. ohmyfantasy.com
-- blocking Supabase egress since 2026-06-08) must not fail the whole DAG.
-- pipeline-executor now honors data.config.continue_on_error on a node:
-- the node is marked failed+tolerated, downstream fan-in proceeds, and the run
-- completes with an error_message note instead of status='failed'.
UPDATE public.pipeline_definitions
SET nodes = (
  SELECT jsonb_agg(
    CASE WHEN n->>'id' LIKE 'src-%'
      THEN jsonb_set(n, '{data,config,continue_on_error}', 'true'::jsonb)
      ELSE n END
    ORDER BY ord
  )
  FROM jsonb_array_elements(nodes) WITH ORDINALITY AS t(n, ord)
),
updated_at = now()
WHERE name = 'marketplace-ingestion';
