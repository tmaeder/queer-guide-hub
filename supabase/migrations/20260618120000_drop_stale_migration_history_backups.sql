-- Tech-debt Phase 0 (#25): drop stale migration-history backup snapshots.
--
-- These were created as safety nets during the 2026-04-18 and 2026-06-10 migration
-- history repairs. Repo migration files == remote schema_migrations has been verified
-- stable since 2026-06-10 (CI `db push` is live), so the snapshots are no longer needed.
-- The _20260418 snapshot is already empty (0 rows). Pure-residue cleanup on a
-- disk-constrained instance. IF EXISTS keeps this idempotent and safe to re-run.
--
-- Intentionally NOT dropped: public.venue_dup_chain_fix_backup (a content-operation
-- reversibility net, out of scope for migration-plumbing cleanup).

DROP TABLE IF EXISTS supabase_migrations.schema_migrations_backup_20260610;
DROP TABLE IF EXISTS supabase_migrations.schema_migrations_backup_20260418;
