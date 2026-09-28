-- Keep the immutable remediation ledger out of the generated GraphQL schema.
-- Admins consume it through governance_remediation_summary(), whose
-- SECURITY DEFINER body performs an explicit role check.

revoke select on public.governance_remediation_runs from authenticated;
revoke select on public.governance_remediation_items from authenticated;

drop policy if exists governance_remediation_runs_admin_read
  on public.governance_remediation_runs;
drop policy if exists governance_remediation_items_admin_read
  on public.governance_remediation_items;
