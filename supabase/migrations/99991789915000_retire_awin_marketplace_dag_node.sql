-- AWIN's dedicated fill automation replaced the marketplace DAG's AWIN fetch
-- during the Wave B rollout.  The upstream feed has never returned a successful
-- response, so mp_fill_awin correctly auto-paused; leaving src-awin in the DAG
-- bypassed that kill switch and continued hitting the dead feed every night.
--
-- Retire only the duplicate DAG caller.  The dedicated automation remains the
-- single, operator-controlled path and can be re-enabled if AWIN is repaired.

update public.pipeline_definitions d
set nodes = (
      select coalesce(jsonb_agg(n order by ord), '[]'::jsonb)
      from jsonb_array_elements(d.nodes) with ordinality as t(n, ord)
      where n->>'id' <> 'src-awin'
    ),
    edges = (
      select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
      from jsonb_array_elements(d.edges) with ordinality as t(e, ord)
      where e->>'source' <> 'src-awin' and e->>'target' <> 'src-awin'
    ),
    description = replace(
      d.description,
      'Bulletproof ingest for AWIN, Shopify, Etsy marketplace products.',
      'Bulletproof ingest for Shopify and Etsy marketplace products.'
    ) || case
      when d.description like '%AWIN fetch retired from DAG%'
        then ''
      else ' [2026-09-20] AWIN fetch retired from DAG; mp_fill_awin is the sole, pause-aware caller.'
    end,
    version = d.version + 1,
    updated_at = now()
where d.name = 'marketplace-ingestion'
  and exists (
    select 1 from jsonb_array_elements(d.nodes) n where n->>'id' = 'src-awin'
  );

update public.workflow_definitions
set description = replace(
      description,
      'Start a marketplace-ingestion pipeline run (AWIN + Shopify + Etsy)',
      'Start a marketplace-ingestion pipeline run (Shopify + Etsy; AWIN has a dedicated pause-aware fill)'
    ),
    updated_at = now()
where name = 'marketplace-ingestion';

do $verify$
declare
  v_node_count integer;
  v_edge_count integer;
begin
  select
    (select count(*) from jsonb_array_elements(d.nodes) n where n->>'id' = 'src-awin'),
    (select count(*) from jsonb_array_elements(d.edges) e
      where e->>'source' = 'src-awin' or e->>'target' = 'src-awin')
  into v_node_count, v_edge_count
  from public.pipeline_definitions d
  where d.name = 'marketplace-ingestion';

  if not found then
    raise exception 'marketplace-ingestion pipeline is missing';
  end if;
  if v_node_count <> 0 or v_edge_count <> 0 then
    raise exception 'AWIN DAG retirement incomplete: % nodes, % edges remain',
      v_node_count, v_edge_count;
  end if;
  if not exists (
    select 1 from public.admin_automations where slug = 'mp_fill_awin'
  ) then
    raise exception 'mp_fill_awin automation is missing; AWIN would have no recoverable caller';
  end if;
end $verify$;
