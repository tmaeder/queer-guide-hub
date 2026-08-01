-- SECURITY: revoke anon/authenticated write privileges on SECURITY DEFINER views.
--
-- `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated` (Supabase stock) hands INSERT/UPDATE/DELETE/TRUNCATE to both API
-- roles on every new relation, including views. For ordinary tables that is safe:
-- RLS is the gate. A view WITHOUT security_invoker runs as its owner (postgres) and
-- therefore BYPASSES the base table's RLS entirely, so those default grants become a
-- real write path.
--
-- Four of these views are simple single-table projections and were auto-updatable,
-- so `anon` could INSERT/UPDATE/DELETE straight into tag_relations,
-- dedup_review_queue and org_link_suggestions — tables whose only RLS policy is an
-- admin/moderator-gated SELECT (no write policy exists at all). Verified reachable
-- as role `anon` before this migration, and denied after it.
--
-- Nothing writes through any of these views (no client code, no DB function), so
-- revoking the write set is behaviour-preserving. REVOKE is idempotent.

revoke insert, update, delete, truncate on
  public.tag_broader,
  public.tag_narrower,
  public.tag_facets,
  public.triage_src_dedup_review,
  public.triage_src_org_link_review,
  public.admin_media_unified,
  public.v_silo_concept_crosswalk
from anon, authenticated;

-- The two triage views additionally leaked admin-only queue contents to ANY logged-in
-- user (dedup_review_queue carries the personality namesake/outing-risk pairs). Their
-- only legitimate readers are get_admin_counts() and get_unified_triage_queue() —
-- both SECURITY DEFINER, owned by postgres, and both already raise 42501 unless the
-- caller holds admin/moderator. Those run as the owner, so removing the API-role
-- grants does not affect them.
revoke all on
  public.triage_src_dedup_review,
  public.triage_src_org_link_review
from anon, authenticated;

-- tag_broader / tag_narrower / tag_facets / v_silo_concept_crosswalk keep SELECT:
-- public read of the tag ontology is the intentional reason they are definer views.

-- Regression guard. The ALTER DEFAULT PRIVILEGES above is still in force, so EVERY
-- new view created in `public` is born with anon/authenticated write grants. Any
-- future definer view therefore silently re-opens this hole. This RPC backs a CI gate
-- (scripts/check-definer-view-grants.mjs) that fails the build when that happens.
create or replace function public.definer_view_api_write_grants()
returns table(view_name text, grantee text, privileges text)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text,
         a.grantee::regrole::text,
         string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname = 'public'
    and c.relkind = 'v'
    and a.grantee::regrole::text in ('anon', 'authenticated')
    and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    -- security_invoker views are safe: writes run as the caller, so base-table RLS applies.
    and coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
           where option_name = 'security_invoker'),
          'false') in ('false', 'off')
  group by 1, 2
$$;

comment on function public.definer_view_api_write_grants() is
  'CI gate: non-security_invoker views in public carrying anon/authenticated write grants. Must return zero rows.';

revoke execute on function public.definer_view_api_write_grants() from anon, authenticated;
grant execute on function public.definer_view_api_write_grants() to service_role;
