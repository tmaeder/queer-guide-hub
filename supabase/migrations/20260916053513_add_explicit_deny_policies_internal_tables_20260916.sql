-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260916053513 with no repo file — the signature of
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

do $migration$
declare target record;
begin
  for target in
    select distinct table_name
    from security_audit.phase3_20260915_no_policy_acl_snapshot
  loop
    execute format(
      'create policy internal_client_deny_all on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      target.table_name
    );
  end loop;
end
$migration$;
;
