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

-- ---------------------------------------------------------------------------
-- Throughput: drain the commit stage from SQL, not through PostgREST.
--
-- The adoption node above lets the nightly DAG *see* these rows, but it cannot
-- clear the backlog. The DAG's commit node calls
-- commit_marketplace_staging_batch over PostgREST, and PostgREST runs it under a
-- role whose statement_timeout is 8s -- the node failed after 8.4s on a batch of
-- 50, because each marketplace commit fans out into price-history, the
-- source-junction upsert and the search_documents trigger. That caps the DAG at
-- a few dozen rows per nightly run against a backlog of ~6.9k eligible rows.
--
-- The RPC already accepts p_pipeline_run_id => NULL, meaning "commit any
-- eligible row regardless of run". Calling it from pg_cron runs it in the
-- database with a timeout we control, so it can move real volume. This is the
-- workhorse; the DAG node stays for the per-run path.
create or replace function public.run_marketplace_commit_drain(p_batch integer default 400)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now(); v_committed int := 0; v_pending int := 0;
begin
  select id, enabled into v_automation_id, v_enabled
    from public.admin_automations where slug = 'marketplace_commit_drain';
  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'marketplace_commit_drain', v_started_at, 'success', 0, 0)
  returning id into v_run_id;
  if v_automation_id is not null and v_enabled is distinct from true then
    update public.admin_automation_runs set finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') where id=v_run_id;
    return jsonb_build_object('skipped', true, 'reason', 'paused');
  end if;

  select count(*) into v_committed
    from public.commit_marketplace_staging_batch(p_batch, null);

  select count(*) into v_pending from public.ingestion_staging s
   where s.target_table = 'marketplace_listings' and s.disposition = 'pending'
     and s.ai_validation_status = 'approved' and s.classification_result is not null
     and (s.dedup_status in ('unique','duplicate') or s.dedup_status is null)
     and s.review_status in ('auto','approved');

  update public.admin_automation_runs
     set finished_at=now(), items_examined=v_committed+v_pending, items_changed=v_committed,
         summary=jsonb_build_object('committed',v_committed,'pending',v_pending,'batch',p_batch)
   where id=v_run_id;
  update public.admin_automations set last_run_at=v_started_at, last_run_status='success'
    where id=v_automation_id;
  return jsonb_build_object('committed', v_committed, 'pending', v_pending);
exception when others then
  update public.admin_automation_runs set finished_at=now(), status='error', error=sqlerrm where id=v_run_id;
  update public.admin_automations set last_run_at=v_started_at, last_run_status='error' where id=v_automation_id;
  return jsonb_build_object('error', sqlerrm);
end;
$fn$;

revoke all on function public.run_marketplace_commit_drain(integer) from public, anon, authenticated;
grant execute on function public.run_marketplace_commit_drain(integer) to service_role;

insert into public.admin_automations (slug, name, description, enabled, trigger, action, conditions)
values ('marketplace_commit_drain', 'Marketplace commit drain',
  'Commits marketplace staging rows that passed validate/relevance/dedup/review but were never committed, including rows staged without a pipeline_run_id by the hourly merchant sync. Runs in SQL so it is not bound by the PostgREST 8s statement timeout that caps the DAG commit node.',
  true, '{"type":"schedule"}'::jsonb,
  '{"fn":"run_marketplace_commit_drain","type":"rpc","jobname":"marketplace_commit_drain"}'::jsonb, '{}'::jsonb)
on conflict (slug) do update set enabled=true, description=excluded.description,
  trigger=excluded.trigger, action=excluded.action;

select cron.schedule('marketplace_commit_drain', '40 * * * *',
  $cmd$SET statement_timeout = '540s'; SELECT public.run_marketplace_commit_drain(1500);$cmd$);
