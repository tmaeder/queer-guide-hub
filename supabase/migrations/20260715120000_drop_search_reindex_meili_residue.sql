-- Declutter: drop decommissioned Meilisearch indexing residue.
-- Search is Postgres + Cloudflare; Meilisearch was decommissioned code-side in 2026-06.
-- These columns only ever tracked Meili indexing task state and are now dead
-- (0 rows use meili_task_uids; meili_top already absent on the live DB).
ALTER TABLE public.search_reindex_jobs
  DROP COLUMN IF EXISTS meili_task_uids,
  DROP COLUMN IF EXISTS meili_top;

-- Migration-history repair backup from 2026-06-10 (see CLAUDE.md); no longer needed.
DROP TABLE IF EXISTS public.schema_migrations_backup_20260610;
