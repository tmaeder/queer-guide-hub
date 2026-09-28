-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928145905 with no repo file — the signature of
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
-- Expose the latest immutable Governance Engine remediation accounting to
-- authorized staff without granting direct table access.
create or replace function public.latest_governance_remediation_summary()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  with latest as (
    select id
    from public.governance_remediation_runs
    order by captured_at desc
    limit 1
  )
  select case
    when current_user in ('postgres','service_role')
      or public.has_role_jwt('admin'::public.app_role)
    then public.governance_remediation_summary((select id from latest))
    else null
  end;
$$;

revoke all on function public.latest_governance_remediation_summary()
  from public,anon;
grant execute on function public.latest_governance_remediation_summary()
  to authenticated,service_role;
;
