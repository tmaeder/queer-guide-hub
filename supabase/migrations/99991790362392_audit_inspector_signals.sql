-- Sentinel for the item-level audit inspector.
--
-- WHAT IT WATCHES, AND WHY EACH KEY IS SEPARATE. `entity_audit_timeline()` is
-- only as honest as three things it cannot check about itself:
--   1. the registry agrees with the catalog — a row claiming a
--      `field_provenance` column the table does not have makes that type's
--      provenance silently empty, and venues are already the asymmetric case;
--   2. the function is still DEFINER **with a role gate in its body** — a
--      later CREATE OR REPLACE that drops the gate ships silently, because
--      scripts/check-anon-function-grants.mjs is scoped to VOLATILE definers
--      and is structurally blind to a STABLE one like this;
--   3. anon holds no EXECUTE on any of it.
--
-- `probe_ok` IS REPORTED FIRST AND SEPARATELY FROM EVERY COUNT. An empty
-- registry, a revoked grant and a genuinely clean corpus all return the same
-- reassuring zeros. Only `probe_ok` plus `registry_rows` tells them apart, and
-- the health script hard-fails on a MISSING key rather than treating absence
-- as a pass — the repeated lesson that an undeployed sentinel must never read
-- as a clean result.
--
-- `unexplained_keys` WARNS AND ONLY HARD-FAILS ON GROWTH. It can only be
-- worked down by a human writing prose, so a zero-invariant would ship red on
-- the first new validator code and get scrolled past. Growth means a producer
-- started emitting a code nobody explained, which is the thing worth stopping.
--
-- service_role ONLY. A SECURITY DEFINER aggregate granted to `authenticated`
-- is granted to every signed-in member, which is how a definer helper leaked
-- safety-gated events in 20290601120731.

create or replace function public.audit_inspector_signals()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_registry_rows     int;
  v_catalog_drift     text[] := '{}';
  v_fn_exists         boolean;
  v_fn_definer        boolean;
  v_fn_gated          boolean;
  v_anon_timeline     boolean;
  v_anon_registry     boolean;
  v_anon_explanations boolean;
  v_explanations      int;
  v_unexplained       int;
  v_gap_keys_missing  text[] := '{}';
  r                   record;
begin
  select count(*) into v_registry_rows from public.audit_entity_registry where active;

  -- Registry vs catalog, both directions. The inverse is the one that bites:
  -- a row claiming 'none' while the column exists means real provenance is
  -- being skipped and the timeline looks clean.
  for r in select * from public.audit_entity_registry where active loop
    if (r.provenance_mode = 'jsonb_column') <> exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=r.table_name and column_name='field_provenance')
    then v_catalog_drift := v_catalog_drift || (r.entity_key || ':provenance'); end if;

    if (r.enrichment_mode = 'jsonb_column') <> exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=r.table_name and column_name='enrichment_status')
    then v_catalog_drift := v_catalog_drift || (r.entity_key || ':enrichment'); end if;

    if r.signals_table is not null and to_regclass('public.'||r.signals_table) is null
    then v_catalog_drift := v_catalog_drift || (r.entity_key || ':signals'); end if;

    if r.consensus_table is not null and to_regclass('public.'||r.consensus_table) is null
    then v_catalog_drift := v_catalog_drift || (r.entity_key || ':consensus'); end if;
  end loop;

  select true, p.prosecdef, (p.prosrc like '%has_any_role_jwt%'),
         has_function_privilege('anon', p.oid, 'EXECUTE')
    into v_fn_exists, v_fn_definer, v_fn_gated, v_anon_timeline
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='entity_audit_timeline';

  select has_table_privilege('anon','public.audit_entity_registry','SELECT') into v_anon_registry;
  select has_table_privilege('anon','public.pipeline_explanations','SELECT') into v_anon_explanations;

  select count(*) into v_explanations from public.pipeline_explanations where active;

  -- The nine coverage-gap keys the timeline emits. A missing one means a gap
  -- row renders as a raw key instead of the sentence explaining what cannot be
  -- shown — which is the one place this system must never be silent.
  select array_agg(k order by k) into v_gap_keys_missing
    from unnest(array[
      'audit:llm_calls_unlinked','audit:ingestion_events_no_entity_link',
      'audit:no_consensus_table','audit:revisions_begin_at_enablement',
      'audit:provenance_undated','audit:no_node_timing',
      'audit:no_provenance_surface','audit:automation_unlinked',
      'audit:unregistered_explanation_keys']) k
   where not exists (select 1 from public.pipeline_explanations pe where pe.key = k and pe.active);

  -- Producer-side: validator codes emitted with no prose. Counted from the
  -- registry's own producer namespace; the authoritative source-tree check is
  -- scripts/check-explanation-keys.mjs, which runs at PR time.
  select count(*) into v_unexplained
    from public.pipeline_explanations
   where active and producer = 'pipeline-validate' and btrim(body) = '';

  return jsonb_build_object(
    'probe_ok', true,
    'registry_rows', v_registry_rows,
    'explanation_rows', v_explanations,
    'catalog_drift', to_jsonb(v_catalog_drift),
    'timeline_exists', coalesce(v_fn_exists, false),
    'timeline_is_definer', coalesce(v_fn_definer, false),
    'timeline_has_role_gate', coalesce(v_fn_gated, false),
    'anon_can_call_timeline', coalesce(v_anon_timeline, false),
    'anon_can_read_registry', coalesce(v_anon_registry, false),
    'anon_can_read_explanations', coalesce(v_anon_explanations, false),
    'gap_keys_missing', to_jsonb(coalesce(v_gap_keys_missing, '{}'::text[])),
    'unexplained_keys', v_unexplained
  );
exception when others then
  -- A broken probe must say so rather than return zeros that read as clean.
  return jsonb_build_object('probe_ok', false, 'error', sqlerrm);
end $$;

revoke all on function public.audit_inspector_signals() from public, anon, authenticated;
grant execute on function public.audit_inspector_signals() to service_role;

do $verify$
declare v jsonb;
begin
  select public.audit_inspector_signals() into v;

  if not (v->>'probe_ok')::boolean then
    raise exception 'audit_inspector_signals probe failed: %', v->>'error';
  end if;
  if (v->>'registry_rows')::int < 11 then
    raise exception 'audit_inspector_signals sees only % registry rows — it is measuring nothing', v->>'registry_rows';
  end if;
  if jsonb_array_length(v->'catalog_drift') > 0 then
    raise exception 'registry disagrees with the catalog: %', v->'catalog_drift';
  end if;
  if jsonb_array_length(v->'gap_keys_missing') > 0 then
    raise exception 'coverage-gap keys with no written explanation: %', v->'gap_keys_missing';
  end if;
  if not (v->>'timeline_has_role_gate')::boolean then
    raise exception 'entity_audit_timeline has no role gate in its body';
  end if;
  if (v->>'anon_can_call_timeline')::boolean
     or (v->>'anon_can_read_registry')::boolean
     or (v->>'anon_can_read_explanations')::boolean then
    raise exception 'anon can reach the audit layer: %', v;
  end if;

  if has_function_privilege('authenticated', 'public.audit_inspector_signals()', 'EXECUTE') then
    raise exception 'audit_inspector_signals is callable by authenticated — a definer aggregate granted to authenticated is granted to every member';
  end if;

  raise notice 'audit_inspector_signals: %', v;
end $verify$;
