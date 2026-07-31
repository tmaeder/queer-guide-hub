-- Stop the marketplace staging leak.
--
-- Measured on prod 2026-07-31: 4,951 `ingestion_staging` rows with
-- entity_type='marketplace', disposition='pending' AND pipeline_run_id IS NULL,
-- the newest created that same day. This is NOT the one-off backlog it was
-- previously recorded as -- it grows every hour.
--
-- Source: the hourly cron `wf-marketplace-sync-merchants` (`20 * * * *`,
-- payload {"limit":6}) invokes marketplace-sync-merchants, which forwards
-- `pipeline_run_id: body.pipeline_run_id` to source-shopify-public /
-- source-woocommerce-public. On the cron path that value is undefined, so rows
-- are staged unstamped. pipeline-normalize scopes to the current run id
-- ("so executor invocations don't get starved behind legacy backlog"), which
-- means unstamped rows are starved *forever*. The whole point of the recurring
-- sync -- re-flowing changed prices/stock into the commit RPC's price/stock
-- UPDATE + price_history path -- has therefore never worked.
--
-- Fix: adopt the orphans into the nightly marketplace-ingestion run, reusing the
-- adoption node the personality DAG already has. pipeline-executor's
-- `source-personality-staging` built-in is renamed to the entity-agnostic
-- `source-adopt-staging` (old slug kept as an alias) and now restricts itself to
-- pipeline_run_id IS NULL so it can never steal rows from a concurrent run.
--
-- Cost is bounded: 2,439 of the 4,951 orphans already exist in
-- marketplace_listings and take marketplace-relevance's refresh path, which
-- skips the LLM entirely; genuinely new products are additionally capped by that
-- node's `daily_cap` (800/UTC day). batch_size 1500 drains the backlog in a few
-- nights and then tracks the ~120/day the hourly sync produces.

insert into public.pipeline_node_types
  (slug, category, display_name, description, edge_function, config_schema, input_ports, output_ports, is_enabled)
values (
  'source-adopt-staging',
  'source',
  'Adopt Orphaned Staging',
  'Claims ingestion_staging rows that were written without a pipeline_run_id into this run so downstream nodes can process them. Configure entity_type and batch_size.',
  null,
  jsonb_build_object(
    'entity_type', jsonb_build_object('type', 'string', 'default', 'personality'),
    'batch_size',  jsonb_build_object('type', 'number', 'default', 500)
  ),
  '[]'::jsonb,
  '["out"]'::jsonb,
  true
)
on conflict (slug) do update set
  category = excluded.category,
  display_name = excluded.display_name,
  description = excluded.description,
  config_schema = excluded.config_schema,
  is_enabled = true;

-- Add the adoption node as another input to the marketplace fan-in.
update public.pipeline_definitions
   set nodes = nodes || jsonb_build_array(
         -- NOTE: node config MUST live under `data.config`. pipeline-executor
         -- reads `node.data?.config` in both handleBuiltInNode and the edge-
         -- function payload builder; a top-level `config` key is silently
         -- ignored, which just means every setting falls back to its default
         -- (here: entity_type 'personality', so the node matched nothing and
         -- reported items_out 0 without erroring).
         jsonb_build_object(
           'id', 'adopt-orphans',
           'type', 'source-adopt-staging',
           'data', jsonb_build_object('config',
             -- 1000 is also the effective ceiling: PostgREST caps the SELECT at
             -- 1000 rows, so a larger batch_size would silently do nothing more.
             jsonb_build_object('entity_type', 'marketplace', 'batch_size', 1000))
         )),
       edges = edges || jsonb_build_array(
         jsonb_build_object(
           'id', 'e-adopt',
           'source', 'adopt-orphans',
           'target', 'fan-in',
           'animated', true
         )),
       updated_at = now()
 where name = 'marketplace-ingestion'
   and not exists (
     select 1 from jsonb_array_elements(nodes) n where n->>'id' = 'adopt-orphans'
   );
