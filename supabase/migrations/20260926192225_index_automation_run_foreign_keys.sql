-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926192225 with no repo file — the signature of
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
-- Cover the automation foreign keys flagged by the production advisor. The
-- composite run index also serves the console's per-automation recent-history
-- query and the partial-streak backfill ordering.
create index if not exists admin_automation_run_contexts_run_id_idx
  on private.admin_automation_run_contexts (run_id);

create index if not exists admin_automation_runs_automation_started_idx
  on public.admin_automation_runs (automation_id, started_at desc);

create index if not exists admin_automations_created_by_idx
  on public.admin_automations (created_by)
  where created_by is not null;
;
