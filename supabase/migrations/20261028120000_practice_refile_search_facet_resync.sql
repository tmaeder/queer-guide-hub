-- SUPERSEDED. This migration's work was applied under 20261027120000; what is
-- left here is a deliberate no-op that exists only to keep the version in the
-- queue and let `db push` past it.
--
-- WHY THE FILE IS STILL HERE RATHER THAN DELETED. `check-migration-drift.mjs`
-- has a merge-base arm that treats any version present on origin/main and
-- missing from the working tree as "already in remote history — you deleted or
-- renamed it", and refuses the push. That inference is normally right and is
-- wrong here, because it assumes merged-to-main implies applied-to-prod. This
-- version is the counterexample: it merged and never applied. Deleting the file
-- is therefore the correct end state and is currently unpushable, so the file
-- stays and its body goes away instead.
--
-- WHAT HAPPENED, IN ORDER
--
--   #3194  shipped the facet resync.
--   #3224  lifted it to 20261028120000 so it would sort above the remote max
--          and apply.
--   (hand) it was applied to prod at 20261027120000 instead, with its final
--          assertion relaxed.
--   #3227  committed the recovery file at 20261027120000 — but left this copy
--          in place, so the repo carried the same migration twice.
--
-- THE STRICT COPY THEN FAILED ITS OWN ASSERTION, and because `db push` stops at
-- the first failure and takes everything behind it, every later migration
-- silently stopped applying. Measured on the deploy for #3228:
--
--     Applying migration 20261028120000_practice_refile_search_facet_resync.sql...
--     ERROR: facet resync: a row left Practices & Play:
--            69=Positions, doggy-style=Positions (SQLSTATE P0001)
--
-- The assertion is not defending anything any more: the sex-positions import
-- deliberately moved `69` and `doggy-style` into the new Positions stop. Where
-- a row LIVES is not this migration's business — the relaxed 20261027120000
-- version says exactly that, and this file predates that correction.
--
-- EMPTYING IT IS LOSSLESS, MEASURED RATHER THAN ASSUMED, on prod before writing
-- this:
--
--     20261028120000 in schema_migrations ......... 0   (never applied)
--     20261027120000 in schema_migrations ......... 1   (applied)
--     facet/column mismatches among the 20 tags ... 0   (the work is done)
--
-- So the effect this migration exists to produce is already in production under
-- the other version. Re-running it would be harmless but pointless; asserting
-- over it is what breaks.
--
-- DO NOT "restore" this body. If you want the resync logic, it is at
-- 20261027120000, which is the version prod actually ran.

do $$
begin
  raise notice
    'practice_refile_search_facet_resync: superseded by 20261027120000, no-op';
end $$;
