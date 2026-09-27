-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926143429 with no repo file — the signature of
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
-- Re-enabled jobs can retain the historical auto_paused marker even after
-- their failure counter has been cleared. That makes the admin Attention view
-- report false incidents. Enabled + zero failures is the authoritative state.
update public.admin_automations
set last_run_status = null,
    updated_at = now()
where enabled
  and consecutive_failures = 0
  and last_run_status = 'auto_paused';
;
