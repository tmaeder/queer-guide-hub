-- Geo Hierarchy Unification — P4 pre-flight audit.
-- The plan calls for a pg_depend audit before each table->view swap. Making it a
-- function (not a one-off query) means the freeze-window operator re-runs it
-- against the CURRENT schema — concurrent agent sessions add objects to this
-- database continuously, so a stale audit is worse than none.
--
-- Every non-zero bucket below is work the swap transaction must carry:
--   triggers        -> BEFORE triggers must be re-created on the spine; the
--                      dual-write triggers are dropped (the mirror becomes the
--                      source of truth).
--   dependent_views -> DROP TABLE requires CASCADE; each view must be recreated.
--   rls_policies    -> re-authored on geo_places + the satellites.
--   generated_cols  -> generated columns cannot exist on a view; move to the spine.
--   indexes         -> recreated on the spine/satellites.

create or replace function public.geo_p4_preflight()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with tgt as (
    select oid, relname from pg_class
     where relname in ('cities','countries','queer_villages')
       and relnamespace = 'public'::regnamespace
  )
  select jsonb_build_object(
    'checked_at', now(),
    'gates', jsonb_build_object(
      'safety_parity_mismatches', (public.geo_safety_parity_check()->>'mismatches')::int,
      'spine_drift',              (public.geo_spine_drift_check()->>'drift_count')::int,
      'external_fks_on_typed',    (select count(*) from pg_constraint con
                                     join pg_class frel on frel.oid = con.confrelid
                                     join pg_class rel  on rel.oid  = con.conrelid
                                    where con.contype = 'f'
                                      and frel.relname in ('cities','countries','queer_villages')
                                      and rel.relname not in ('cities','countries','queer_villages','geo_places'))
    ),
    'swap_workload', jsonb_build_object(
      'triggers', (select coalesce(jsonb_agg(jsonb_build_object('tbl', tgt.relname, 'trg', t.tgname)), '[]'::jsonb)
                     from pg_trigger t join tgt on tgt.oid = t.tgrelid where not t.tgisinternal),
      'dependent_views', (select coalesce(jsonb_agg(distinct c2.relname), '[]'::jsonb)
                            from pg_depend d join tgt on tgt.oid = d.refobjid
                            join pg_rewrite r on r.oid = d.objid
                            join pg_class c2 on c2.oid = r.ev_class
                           where d.classid = 'pg_rewrite'::regclass
                             and c2.relkind in ('v','m')
                             and c2.relname not in ('cities','countries','queer_villages')),
      'rls_policies', (select coalesce(jsonb_agg(jsonb_build_object('tbl', tgt.relname, 'policy', p.polname)), '[]'::jsonb)
                         from pg_policy p join tgt on tgt.oid = p.polrelid),
      'generated_cols', (select coalesce(jsonb_agg(jsonb_build_object('tbl', tgt.relname, 'col', a.attname)), '[]'::jsonb)
                           from pg_attribute a join tgt on tgt.oid = a.attrelid where a.attgenerated <> ''),
      'index_count', (select count(*) from pg_index i join tgt on tgt.oid = i.indrelid)
    )
  );
$$;

revoke execute on function public.geo_p4_preflight() from public, anon, authenticated;

comment on function public.geo_p4_preflight() is
  'P4 freeze-window pre-flight. Re-run immediately before the swap: all three gates must be 0, and every swap_workload bucket must be handled inside the swap transaction.';
