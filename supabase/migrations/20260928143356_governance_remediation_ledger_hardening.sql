-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928143356 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Keep the immutable remediation ledger out of the generated GraphQL schema.
-- Admins consume it through governance_remediation_summary(), whose
-- SECURITY DEFINER body performs an explicit role check.

revoke select on public.governance_remediation_runs from authenticated;
revoke select on public.governance_remediation_items from authenticated;

drop policy if exists governance_remediation_runs_admin_read
  on public.governance_remediation_runs;
drop policy if exists governance_remediation_items_admin_read
  on public.governance_remediation_items;
;
