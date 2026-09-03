-- ============================================================================
-- TOMBSTONE — this version never applied and never will. Do not delete it.
-- ----------------------------------------------------------------------------
-- The real definition of staging_unreachable_stats() now lives in
-- 20261206100100_staging_unreachable_sentinel.sql. This file is retained as an
-- empty placeholder ONLY so the version keeps a repo file.
--
-- Why it never applied: this migration merged in #3287, but the same merge
-- carried 20261203100000_quality_views_drop_enrichment_status_proxy.sql, which
-- collided with 20261203100000_swiss_shell_city_dispositions.sql from #3293.
-- `db push` matches by VERSION, so the collision failed the push for the whole
-- batch (Deploy Supabase functions on 83861531e: PUSH_FAILED=true, "MERGED
-- MIGRATIONS DID NOT APPLY"). Remote history then moved on to 20261204100000,
-- which left this file sorting BELOW the max — `db push` aborts on that rather
-- than inserting mid-history. Verified on prod: schema_migrations has no row
-- for 20261203100100, and to_regprocedure('staging_unreachable_stats()') was
-- NULL.
--
-- Why a tombstone instead of a rename: the pre-push guard in
-- scripts/check-migration-versions.mjs treats every version present at the
-- origin/main merge-base as already in remote history and refuses to let a
-- tree delete or rename it. That rule is right in general — renaming a
-- genuinely-applied migration makes its SQL silently never run — and it is
-- simply working from a premise that does not hold here, because the push
-- failed. Leaving the version occupied satisfies the guard without weakening
-- it and without a --no-verify.
--
-- Deliberately a NO-OP rather than a copy of the function: two files defining
-- the same object is how a definition and its "latest" copy drift apart. If
-- history is ever repaired and this does apply, applying nothing is correct —
-- 20261206100100 is the single source of truth.
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'no-op tombstone: staging_unreachable_stats() is defined in 20261206100100';
END;
$$;
