-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926165706 with no repo file — the signature of
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
-- The 2026-07 registry sweeps copied full pg_cron commands into descriptions.
-- Besides making the admin table noisy, those commands can contain public API
-- tokens or internal endpoint details. The structured action remains the
-- canonical command source; the human description should describe provenance.
update public.admin_automations
set description = rtrim(left(description, position(' Command:' in description) - 1)),
    updated_at = now()
where description like 'Auto-registered from pg_cron% Command:%';

do $$
begin
  if exists (
    select 1 from public.admin_automations
    where description like 'Auto-registered from pg_cron% Command:%'
  ) then
    raise exception 'automation command text remains in an operator description';
  end if;
end
$$;
;
