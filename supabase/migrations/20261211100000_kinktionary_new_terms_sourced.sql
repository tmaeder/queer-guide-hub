-- NEUTRALISED 2026-09-03. This migration's original body aborted `db push` and
-- stranded every migration merged after it. The version is kept and the body
-- emptied, deliberately, so the queue drains.
--
-- WHAT IT USED TO DO. Create 161 sourced Kinktionary glossary terms, guarded by
-- an assertion that none of the slugs already existed. That guard fired:
--
--     Applying migration 20261211100000_kinktionary_new_terms_sourced.sql...
--     ERROR: new terms: 2 slug(s) already exist — revive them instead of
--            creating duplicates (SQLSTATE P0001)
--     At statement: 2
--
-- `db push` stops at the FIRST failure, so nothing after this version applied.
-- Seven consecutive `Deploy Supabase functions` runs failed on this exact line
-- between 07:42Z and 13:28Z while edge functions kept deploying — production
-- running new code against an older schema, which is the state that workflow's
-- annotation explicitly warns about. `max(version)` in `schema_migrations` sat
-- at 20261210110000 while main was far ahead of it.
--
-- WHY THE BODY IS EMPTIED RATHER THAN THE FILE DELETED. Deleting it is the
-- cleaner change and was written first, then abandoned: `check-migration-drift`
-- rejects a repo that has no file for a version reachable from origin/main. Its
-- reasoning is "already merged, so already in remote history" — an INFERENCE,
-- and a false one here, because these never applied. That inference is only
-- wrong when db push is broken, which is exactly when someone needs to remove a
-- migration. Keeping the file at its exact version sidesteps the argument
-- entirely: there is nothing to drift.
--
-- NOTHING IS LOST. The 296 definitions live in
-- `scripts/data-quality/kinktionary-new-term-definitions.mjs`, untouched, and
-- the original SQL is in git at commit 218056281.
--
-- HOW TO RE-LAND. Regenerate at a NEW version above the then-current max
-- (`select max(version) from supabase_migrations.schema_migrations`, and check
-- `ls .claude/worktrees/*/supabase/migrations/` too — the ceiling is routinely
-- in an unmerged worktree). This version is consumed and must not be reused.
--
-- RECONCILE THE GUARD FIRST, do not just renumber. The guard reported 2
-- colliding slugs; 62 of the 161 slugs in the original file already exist in
-- `unified_tags` — 54 active, 4 deprecated, 4 merged, including `polyamory`
-- with 72 assignments. Either the guard's temp table is narrower than the file's
-- VALUES list, or it detects 2 of 62. The `merged` ones — urolagnia, swinging,
-- edgeplay, demisexual — matter most: `merge_tag_concept` sets `merged_into_id`,
-- so a fresh row at those slugs collides with a redirect, not a live tag.
--
-- The publication guards that came with this migration (nothing created
-- indexable or human-reviewed; provenance recorded privately) were good and are
-- NOT being argued against. They are simply unreachable now that the body is
-- empty, and their tests are removed in the same commit. Restore both together.

do $$
begin
  raise notice 'kinktionary_new_terms_sourced: neutralised — see header; re-land at a new version';
end
$$;
